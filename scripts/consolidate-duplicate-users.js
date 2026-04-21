/* eslint-disable no-console */
/**
 * Consolidate duplicate User documents created when a legacy record (no
 * auth0Id) and a freshly-created Auth0-linked record co-exist for the same
 * person.
 *
 * Two patterns are merged automatically:
 *
 *   1. Legacy pair: User A has auth0Id unset; User B has
 *      auth0Id === String(User A._id). That's a strong signal (the Auth0
 *      user_id literally equals the old Mongo _id).
 *
 *   2. Prefix pair: User X has auth0Id "auth0|abc"; User Y has "abc". Same
 *      person in two different connection-prefix formats.
 *
 * Strategy:
 *   - Pick the "canonical" User — the one with a clean, prefix-less auth0Id.
 *     If no candidate has that, pick the newest doc by createdAt.
 *   - Collect every roster owned by any doc in the group; keep the most-
 *     recently updated one, delete the rest, and point its `owner` at the
 *     canonical user.
 *   - Set canonical.roster to the kept roster, copy over name/region/country
 *     where the canonical is missing them, then delete the other User docs.
 *
 * Ambiguous groups (e.g. two docs both missing auth0Id) are reported and
 * left untouched.
 *
 * Usage:
 *   node scripts/consolidate-duplicate-users.js --dry   (preview, no writes)
 *   node scripts/consolidate-duplicate-users.js         (apply writes)
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User, Roster } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

const stripPrefix = (id) => (id && id.includes('|') ? id.split('|').pop() : id);

const isLinkedPair = (a, b) => {
  // Legacy pair: one side has no auth0Id, the other's auth0Id == that one's _id
  const aId = String(a._id);
  const bId = String(b._id);
  if (!a.auth0Id && b.auth0Id && b.auth0Id === aId) return true;
  if (!b.auth0Id && a.auth0Id && a.auth0Id === bId) return true;
  // Prefix pair: both have auth0Id, suffix matches
  if (a.auth0Id && b.auth0Id && stripPrefix(a.auth0Id) === stripPrefix(b.auth0Id)) {
    return true;
  }
  return false;
};

const pickCanonical = (group) => {
  // Prefer a user whose auth0Id is defined and does NOT contain a pipe.
  const clean = group.find((u) => u.auth0Id && !u.auth0Id.includes('|'));
  if (clean) return clean;
  // Otherwise, the most recently created doc.
  return [...group].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
};

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n');

  const users = await User.find({}).lean();

  // Group by lowercased name (our strongest signal that two docs refer to
  // the same person without a shared auth0Id).
  const byName = new Map();
  for (const u of users) {
    const key = (u.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(u);
  }

  const groups = [...byName.values()].filter((g) => g.length > 1);
  console.log(`Found ${groups.length} same-name groups to examine.\n`);

  let consolidated = 0;
  let skipped = 0;

  for (const group of groups) {
    // Require every doc in the group to pair-link with at least one other.
    // This keeps us from merging two genuine same-name strangers.
    const allLinked = group.every((a) =>
      group.some((b) => a._id !== b._id && isLinkedPair(a, b))
    );
    if (!allLinked) {
      console.log(`[skip] ambiguous group for "${group[0].name}":`);
      for (const u of group) {
        console.log(`  _id=${u._id} auth0Id=${u.auth0Id}`);
      }
      skipped += 1;
      continue;
    }

    const canonical = pickCanonical(group);
    const others = group.filter((u) => String(u._id) !== String(canonical._id));

    // Collect all rosters owned by anyone in the group.
    const rosters = await Roster.find({ owner: { $in: group.map((u) => u._id) } }).lean();
    rosters.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    const keep = rosters[0] || null;
    const dropRosters = rosters.slice(1);

    console.log(`\n"${canonical.name}"`);
    console.log(`  canonical: _id=${canonical._id} auth0Id=${canonical.auth0Id}`);
    for (const o of others) {
      console.log(`  drop user: _id=${o._id} auth0Id=${o.auth0Id}`);
    }
    if (keep) {
      console.log(
        `  keep roster: _id=${keep._id} owner=${keep.owner} updatedAt=${keep.updatedAt?.toISOString?.() || keep.updatedAt}`
      );
    } else {
      console.log('  no roster to keep');
    }
    for (const r of dropRosters) {
      console.log(
        `  drop roster: _id=${r._id} owner=${r.owner} updatedAt=${r.updatedAt?.toISOString?.() || r.updatedAt}`
      );
    }

    if (!isDryRun) {
      // Re-own the kept roster on the canonical user.
      if (keep && String(keep.owner) !== String(canonical._id)) {
        await Roster.updateOne({ _id: keep._id }, { $set: { owner: canonical._id } });
      }

      // Drop the losing rosters.
      if (dropRosters.length > 0) {
        await Roster.deleteMany({ _id: { $in: dropRosters.map((r) => r._id) } });
      }

      // Sync canonical's profile fields from the other docs when missing.
      const canonicalDoc = await User.findById(canonical._id);
      for (const o of others) {
        if (!canonicalDoc.name && o.name) canonicalDoc.name = o.name;
        if (!canonicalDoc.region && o.region) canonicalDoc.region = o.region;
        if (!canonicalDoc.country && o.country) canonicalDoc.country = o.country;
      }
      canonicalDoc.roster = keep ? keep._id : null;
      await canonicalDoc.save();

      // Delete the other User docs.
      await User.deleteMany({ _id: { $in: others.map((o) => o._id) } });
    }

    consolidated += 1;
  }

  console.log(
    `\nDone. ${isDryRun ? 'would consolidate' : 'consolidated'} ${consolidated} group(s). skipped ${skipped} ambiguous.`
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
