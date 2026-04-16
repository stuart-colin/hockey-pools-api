/* eslint-disable no-console */
/**
 * Backfill rosters whose `owner` references a document that doesn't exist in
 * the `users` collection (populate returns null).
 *
 * The stored owner value is almost always the user's Auth0 sub (trailing part,
 * which for Auth0 DB connections looks like a Mongo ObjectId). We re-link by
 * searching users.auth0Id for that value and swapping in the real User._id.
 *
 * Usage:
 *   node scripts/backfill-orphan-rosters.js --dry   (preview, no writes)
 *   node scripts/backfill-orphan-rosters.js         (apply writes)
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

const { Roster, User } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n');

  const orphans = await Roster.aggregate([
    { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'u' } },
    { $match: { u: { $size: 0 } } },
    { $project: { owner: 1 } },
  ]);

  console.log(`Found ${orphans.length} orphan roster(s).\n`);

  for (const orphan of orphans) {
    const rosterId = String(orphan._id);
    const storedOwner = orphan.owner == null ? null : String(orphan.owner);

    if (!storedOwner) {
      console.log(`skip ${rosterId} — owner is null (no auth0Id to match on)`);
      continue;
    }

    // Try to find the user whose auth0Id matches the value currently stored in
    // roster.owner. This is how submitRoster used to write it pre-fix.
    const matchingUser = await User.findOne({ auth0Id: storedOwner });

    if (!matchingUser) {
      console.log(`no match for ${rosterId} (owner=${storedOwner}) — manual intervention needed`);
      continue;
    }

    console.log(
      `${isDryRun ? 'would relink' : 'relinking'} ${rosterId}: owner ${storedOwner} -> ${matchingUser._id} (${matchingUser.name || '(no name)'})`
    );

    if (!isDryRun) {
      await Roster.updateOne({ _id: orphan._id }, { $set: { owner: matchingUser._id } });
    }
  }

  console.log('\n-- final sweep: rosters whose owner does not resolve to a user --');
  const after = await Roster.aggregate([
    { $lookup: { from: 'users', localField: 'owner', foreignField: '_id', as: 'u' } },
    { $match: { u: { $size: 0 } } },
    { $project: { owner: 1, ownerType: { $type: '$owner' } } },
  ]);
  console.log(JSON.stringify(after, null, 2));

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
