/* eslint-disable no-console */
/**
 * Auto-sync User profiles from Auth0 user_metadata.
 *
 * Walks every Mongo User whose profile looks incomplete (no region/country, or
 * `name` still looks like an email), fetches the matching Auth0 user via the
 * Management API, and copies `user_metadata.{name,region,country}` onto the
 * Mongo record.
 *
 * Required env (in ../.env):
 *   MONGODB_USER / MONGODB_PASS / MONGODB_NAME (as in the API service)
 *   AUTH0_DOMAIN                 e.g. your-tenant.us.auth0.com
 *                                (falls back to AUTH_ISSUER's hostname)
 *   AUTH0_M2M_CLIENT_ID          from the Auth0 M2M application
 *   AUTH0_M2M_CLIENT_SECRET      from the Auth0 M2M application
 *
 * Usage:
 *   node scripts/sync-user-profiles-from-auth0.js --dry   (preview, no writes)
 *   node scripts/sync-user-profiles-from-auth0.js         (apply writes)
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');
const axios = require('axios');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const {
  MONGODB_USER,
  MONGODB_PASS,
  MONGODB_NAME,
  AUTH_ISSUER,
  AUTH0_DOMAIN,
  AUTH0_M2M_CLIENT_ID,
  AUTH0_M2M_CLIENT_SECRET,
} = process.env;

if (!MONGODB_USER || !MONGODB_PASS || !MONGODB_NAME) {
  console.error('Missing MONGODB_USER / MONGODB_PASS / MONGODB_NAME in .env');
  process.exit(1);
}

const auth0Domain = (AUTH0_DOMAIN || (AUTH_ISSUER || ''))
  .replace(/^https?:\/\//, '')
  .replace(/\/$/, '');

if (!auth0Domain || !AUTH0_M2M_CLIENT_ID || !AUTH0_M2M_CLIENT_SECRET) {
  console.error(
    'Missing Auth0 settings. Need AUTH_ISSUER (or AUTH0_DOMAIN) plus ' +
      'AUTH0_M2M_CLIENT_ID and AUTH0_M2M_CLIENT_SECRET.'
  );
  process.exit(1);
}

const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

const looksLikeEmail = (value) =>
  typeof value === 'string' && /.+@.+\..+/.test(value);

const isIncomplete = (user) =>
  !user.region || !user.country || looksLikeEmail(user.name);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getManagementToken = async () => {
  const { data } = await axios.post(`https://${auth0Domain}/oauth/token`, {
    grant_type: 'client_credentials',
    client_id: AUTH0_M2M_CLIENT_ID,
    client_secret: AUTH0_M2M_CLIENT_SECRET,
    audience: `https://${auth0Domain}/api/v2/`,
  });
  return data.access_token;
};

// Try the email endpoint first (robust for DB users whose Mongo `name` is
// their email). If that doesn't yield a match, fall back to wildcard search
// by the stored auth0Id across all known connection prefixes.
const lookupAuth0User = async (mongoUser, token) => {
  const base = `https://${auth0Domain}/api/v2`;
  const headers = { Authorization: `Bearer ${token}` };

  if (looksLikeEmail(mongoUser.name)) {
    const email = mongoUser.name.toLowerCase();
    const { data } = await axios.get(`${base}/users-by-email`, {
      headers,
      params: { email },
    });
    if (Array.isArray(data) && data.length > 0) {
      // Prefer an account whose user_id ends with the stored auth0Id when
      // there are multiples (e.g. DB + social linked accounts).
      const matched = data.find((u) =>
        typeof u.user_id === 'string' && u.user_id.endsWith(mongoUser.auth0Id)
      );
      return matched || data[0];
    }
  }

  // Fallback: look up by user_id. Some legacy rows stored the full sub
  // (e.g. "auth0|abc123"), others stored only the ID suffix — so if it
  // already contains a pipe, use it as-is; otherwise try each common
  // connection prefix since search_engine v3 doesn't allow leading
  // wildcards on user_id.
  const candidates = mongoUser.auth0Id.includes('|')
    ? [mongoUser.auth0Id]
    : [
        `auth0|${mongoUser.auth0Id}`,
        `google-oauth2|${mongoUser.auth0Id}`,
        `facebook|${mongoUser.auth0Id}`,
        `windowslive|${mongoUser.auth0Id}`,
        `apple|${mongoUser.auth0Id}`,
      ];
  for (const id of candidates) {
    try {
      const { data } = await axios.get(
        `${base}/users/${encodeURIComponent(id)}`,
        { headers }
      );
      if (data && data.user_id) return data;
    } catch (err) {
      if (err.response && err.response.status === 404) continue;
      throw err;
    }
  }
  return null;
};

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(
    isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n'
  );

  const token = await getManagementToken();
  console.log('Got Auth0 Management API token\n');

  const users = await User.find({});
  const targets = users.filter(isIncomplete);
  console.log(`Scanning ${users.length} users, ${targets.length} look incomplete.\n`);

  let updated = 0;
  let skipped = 0;
  let missing = 0;

  for (const user of targets) {
    // Throttle well under the Management API free-tier rate limit.
    await sleep(500);

    let auth0User;
    try {
      auth0User = await lookupAuth0User(user, token);
    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.log(
          `rate-limited on ${user.name} (${user._id}) — backing off 10s and retrying`
        );
        await sleep(10000);
        try {
          auth0User = await lookupAuth0User(user, token);
        } catch (retryErr) {
          console.log(
            `retry failed for ${user.name} (${user._id}): ${
              retryErr.response
                ? `${retryErr.response.status} ${JSON.stringify(retryErr.response.data)}`
                : retryErr.message
            }`
          );
          continue;
        }
      } else {
        console.log(
          `error looking up ${user.name} (${user._id}): ${
            err.response ? `${err.response.status} ${JSON.stringify(err.response.data)}` : err.message
          }`
        );
        continue;
      }
    }

    if (!auth0User) {
      console.log(`no Auth0 match for ${user.name} (${user._id}, auth0Id=${user.auth0Id})`);
      missing += 1;
      continue;
    }

    const md = auth0User.user_metadata || {};
    const nextName = md.name || auth0User.name;
    const updates = {};
    if (nextName && nextName !== user.name && !looksLikeEmail(nextName)) {
      updates.name = nextName;
    }
    if (md.region && md.region !== user.region) updates.region = md.region;
    if (md.country && md.country !== user.country) updates.country = md.country;

    if (Object.keys(updates).length === 0) {
      console.log(`${user.name} (${user._id}): Auth0 had nothing new — skipping`);
      skipped += 1;
      continue;
    }

    console.log(
      `${isDryRun ? 'would update' : 'updating '} ${user.name} (${user._id}) -> ${JSON.stringify(
        updates
      )}`
    );
    if (!isDryRun) {
      await User.updateOne({ _id: user._id }, { $set: updates });
      updated += 1;
    }
  }

  console.log(
    `\nDone. updated=${isDryRun ? 0 : updated}, skipped=${skipped}, no-auth0-match=${missing}`
  );

  console.log('\n-- final sweep: users still missing region/country --');
  const after = await User.find(
    { $or: [{ region: { $in: [null, ''] } }, { country: { $in: [null, ''] } }] },
    { name: 1, region: 1, country: 1, auth0Id: 1 }
  );
  console.log(JSON.stringify(after, null, 2));

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
