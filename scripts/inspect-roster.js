/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { Roster, Player, User } = require('../src/models');

const ROSTER_ID = process.argv[2] || '69e3c1853d9844027ce813b0';

const run = async () => {
  await mongoose.connect(mongoUrl);
  const r = await Roster.findById(ROSTER_ID)
    .populate('center')
    .populate('left')
    .populate('right')
    .populate('defense')
    .populate('goalie')
    .populate('utility')
    .lean();
  if (!r) {
    console.log('roster not found');
    process.exit(0);
  }
  const owner = await User.findById(r.owner).lean();
  console.log(`Owner: ${owner?.name} (${r.owner})`);
  console.log(`Roster updatedAt: ${r.updatedAt} createdAt: ${r.createdAt}\n`);

  for (const pos of ['center', 'left', 'right', 'defense', 'goalie']) {
    const ids = (r[pos] || []).map((p) => String(p._id));
    const unique = new Set(ids);
    console.log(`${pos}: ${ids.length} entries, ${unique.size} unique`);
    (r[pos] || []).forEach((p, i) => {
      console.log(`  [${i}] ${p.skaterFullName || p.goalieFullName} (${p.teamName}) id=${p._id}`);
    });
  }
  if (r.utility) {
    const u = r.utility;
    console.log(`utility: ${u.skaterFullName || u.goalieFullName} (${u.teamName}) id=${u._id}`);
  } else {
    console.log('utility: <none>');
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
