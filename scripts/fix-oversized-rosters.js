/* eslint-disable no-console */
/**
 * Fix any roster whose position arrays exceed schema caps by:
 *   1. Deduping each position keeping the LAST occurrence of each player id
 *      (so the most recent submission's picks survive a concat).
 *   2. Trimming each position to its schema cap from the END (most recent).
 *
 * Schema caps: center 3, left 3, right 3, defense 4, goalie 2, utility 1.
 *
 * Usage:
 *   node scripts/fix-oversized-rosters.js --dry
 *   node scripts/fix-oversized-rosters.js
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { Roster, User } = require('../src/models');

const POSITION_CAPS = {
  center: 3,
  left: 3,
  right: 3,
  defense: 4,
  goalie: 2,
};

const isDryRun = process.argv.includes('--dry');

const arrLen = (v) => (Array.isArray(v) ? v.length : v ? 1 : 0);

// Dedupe array of ObjectIds keeping LAST occurrence, then trim from the end
// to the cap. Returns plain string ids in their final order.
const dedupeKeepingLatestThenTrim = (ids, cap) => {
  const seen = new Set();
  const reversed = [...ids].reverse();
  const dedupedReversed = [];
  for (const id of reversed) {
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedReversed.push(id);
  }
  const dedup = dedupedReversed.reverse();
  return dedup.slice(-cap);
};

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log(`Connected. Mode: ${isDryRun ? 'DRY-RUN' : 'WRITE'}\n`);

  const rosters = await Roster.find({}).lean();
  let touched = 0;

  for (const r of rosters) {
    const total =
      arrLen(r.center) + arrLen(r.left) + arrLen(r.right) +
      arrLen(r.defense) + arrLen(r.goalie) + arrLen(r.utility);
    if (total <= 16) continue;

    const owner = await User.findById(r.owner).lean();
    console.log(`Roster ${r._id} owner=${owner?.name || '?'} (${r.owner})  total=${total}`);

    const updates = {};
    for (const [pos, cap] of Object.entries(POSITION_CAPS)) {
      const before = r[pos] || [];
      const after = dedupeKeepingLatestThenTrim(before, cap);
      console.log(
        `  ${pos.padEnd(8)} ${before.length} -> ${after.length} (cap ${cap})  ${
          before.length !== after.length ? 'TRIMMED' : 'unchanged'
        }`
      );
      updates[pos] = after;
    }
    // utility is a single ObjectId — leave as-is.

    const newTotal =
      updates.center.length + updates.left.length + updates.right.length +
      updates.defense.length + updates.goalie.length + arrLen(r.utility);
    console.log(`  new total: ${newTotal}`);

    if (!isDryRun) {
      await Roster.updateOne({ _id: r._id }, { $set: updates });
      console.log(`  saved.`);
    }
    touched += 1;
    console.log('');
  }

  console.log(`${isDryRun ? 'Would touch' : 'Touched'} ${touched} roster(s).`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
