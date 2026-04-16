/* eslint-disable no-console */
/**
 * Find owners with more than one roster, keep the most recently created one,
 * delete the rest. Used to clean up duplicates created during the window
 * between the submitRoster fix deploy and the orphan backfill.
 *
 * Usage:
 *   node scripts/dedupe-rosters.js --dry   (preview, no writes)
 *   node scripts/dedupe-rosters.js         (apply writes)
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { Roster } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n');

  // Find owners with more than one roster
  const dupes = await Roster.aggregate([
    { $match: { owner: { $ne: null } } },
    { $group: { _id: '$owner', rosterIds: { $push: '$_id' }, count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]);

  console.log(`Found ${dupes.length} owner(s) with duplicate rosters.\n`);

  for (const group of dupes) {
    // Sort roster _ids so newest is last (ObjectId ids sort chronologically)
    const sortedIds = group.rosterIds.map(String).sort();
    const keep = sortedIds[sortedIds.length - 1];
    const discard = sortedIds.slice(0, -1);

    console.log(`owner ${group._id}: keeping ${keep}, discarding ${discard.join(', ')}`);

    if (!isDryRun) {
      await Roster.deleteMany({ _id: { $in: discard.map((id) => new mongoose.Types.ObjectId(id)) } });
    }
  }

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
