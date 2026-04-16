/* eslint-disable no-console */
/**
 * Backfill name / region / country on User documents using values that were
 * pasted out of the Auth0 dashboard's user_metadata section.
 *
 * This is a one-off for the three accounts created before the API was storing
 * user_metadata (/userinfo.name fell back to their email, so `name` was an
 * email and `region` / `country` were missing). Going forward, the self-heal
 * in roster.service.submitRoster keeps this in sync automatically.
 *
 * Usage:
 *   node scripts/backfill-user-profiles.js --dry   (preview, no writes)
 *   node scripts/backfill-user-profiles.js         (apply writes)
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
if (!MONGODB_USER || !MONGODB_PASS || !MONGODB_NAME) {
  console.error('Missing MONGODB_USER / MONGODB_PASS / MONGODB_NAME in .env');
  process.exit(1);
}

const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

// Keyed by the user's current `name` in Mongo (which is their email — that's
// how we identify them because auth0Id isn't easy to eyeball and email is
// what Auth0 persisted as the OIDC `name` claim).
const PROFILE_BACKFILL = {
  'kennyvollet@yahoo.ca': { name: 'Kenny Vollet', country: 'Canada', region: 'AB' },
  'killianmcsweeney@gmail.com': { name: 'Killian McSweeney', country: 'Canada', region: 'BC' },
  'devonaubreystone@gmail.com': { name: 'Devon Stone', country: 'Canada', region: 'AB' },
};

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n');

  for (const [lookupEmail, profile] of Object.entries(PROFILE_BACKFILL)) {
    const user = await User.findOne({ name: lookupEmail });

    if (!user) {
      console.log(`no match for ${lookupEmail} — skipping (may already be backfilled)`);
      continue;
    }

    const updates = {};
    if (profile.name && profile.name !== user.name) updates.name = profile.name;
    if (profile.region && profile.region !== user.region) updates.region = profile.region;
    if (profile.country && profile.country !== user.country) updates.country = profile.country;

    if (Object.keys(updates).length === 0) {
      console.log(`${lookupEmail} (${user._id}): already in sync`);
      continue;
    }

    console.log(
      `${isDryRun ? 'would update' : 'updating '} ${lookupEmail} (${user._id}): ${JSON.stringify(updates)}`
    );

    if (!isDryRun) {
      await User.updateOne({ _id: user._id }, { $set: updates });
    }
  }

  console.log('\n-- final sweep: users still missing region/country --');
  const after = await User.find(
    { $or: [{ region: { $in: [null, ''] } }, { country: { $in: [null, ''] } }] },
    { name: 1, region: 1, country: 1 }
  );
  console.log(JSON.stringify(after, null, 2));

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
