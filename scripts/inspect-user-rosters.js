/* eslint-disable no-console */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User, Roster } = require('../src/models');

const NAME = process.argv[2] || 'Ryan Brooks';

const run = async () => {
  await mongoose.connect(mongoUrl);

  const users = await User.find({ name: new RegExp(`^${NAME}$`, 'i') }).lean();
  console.log(`Found ${users.length} user doc(s) named "${NAME}":`);
  for (const u of users) {
    console.log(`  _id=${u._id} auth0Id=${u.auth0Id} createdAt=${u.createdAt?.toISOString?.()} updatedAt=${u.updatedAt?.toISOString?.()}`);
  }

  const rosters = await Roster.find({
    owner: { $in: users.map((u) => u._id) },
  }).lean();
  console.log(`\nFound ${rosters.length} roster doc(s) for those user(s):`);
  for (const r of rosters) {
    const total =
      (r.center?.length || 0) +
      (r.left?.length || 0) +
      (r.right?.length || 0) +
      (r.defense?.length || 0) +
      (r.goalie?.length || 0) +
      (r.utility ? 1 : 0);
    console.log(
      `  _id=${r._id} owner=${r.owner} totalPlayers=${total} createdAt=${r.createdAt?.toISOString?.()} updatedAt=${r.updatedAt?.toISOString?.()}`
    );
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
