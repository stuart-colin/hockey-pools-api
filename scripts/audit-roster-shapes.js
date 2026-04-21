/* eslint-disable no-console */
/**
 * Audit roster shapes to find any roster whose summed players exceed 16.
 *
 * The schema says:
 *   center/left/right: [Player]   (3 each typical)
 *   defense:           [Player]   (4)
 *   goalie:            [Player]   (2)
 *   utility:            Player    (1)
 *
 * Total per roster = 16. If the rendered Insights "Most Players Remaining"
 * is showing 31, then at least one roster in the DB has more than 16 players
 * across those fields — most likely `utility` got stored as an array of every
 * player (createRoster in the controller treats utility as an array even
 * though the schema expects a single ObjectId).
 *
 * Read-only.
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { Roster, User } = require('../src/models');

const arrLen = (v) => (Array.isArray(v) ? v.length : v ? 1 : 0);

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB\n');

  const rosters = await Roster.find({}).lean();
  console.log(`Scanning ${rosters.length} rosters.\n`);

  const oversized = [];
  for (const r of rosters) {
    const counts = {
      center: arrLen(r.center),
      left: arrLen(r.left),
      right: arrLen(r.right),
      defense: arrLen(r.defense),
      goalie: arrLen(r.goalie),
      utility: arrLen(r.utility),
    };
    const total =
      counts.center + counts.left + counts.right + counts.defense + counts.goalie + counts.utility;
    if (total > 16) {
      oversized.push({ id: r._id, owner: r.owner, total, counts, utilityRaw: r.utility });
    }
  }

  console.log(`Rosters with > 16 players: ${oversized.length}\n`);
  for (const r of oversized.slice(0, 10)) {
    const owner = await User.findById(r.owner).lean();
    console.log(
      `roster=${r.id} owner=${r.owner} (${owner?.name || '?'}) total=${r.total}  ${JSON.stringify(r.counts)}`
    );
    if (Array.isArray(r.utilityRaw)) {
      console.log(`  utility is an ARRAY of ${r.utilityRaw.length} entries`);
    }
  }
  if (oversized.length > 10) {
    console.log(`...and ${oversized.length - 10} more`);
  }

  // Distribution of totals
  const distribution = {};
  for (const r of rosters) {
    const total =
      arrLen(r.center) + arrLen(r.left) + arrLen(r.right) + arrLen(r.defense) + arrLen(r.goalie) + arrLen(r.utility);
    distribution[total] = (distribution[total] || 0) + 1;
  }
  console.log('\nTotal-players-per-roster distribution:');
  Object.entries(distribution)
    .sort(([a], [b]) => Number(a) - Number(b))
    .forEach(([total, count]) => console.log(`  ${total}: ${count}`));

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
