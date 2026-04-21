/* eslint-disable no-console */
/**
 * Preemptive fix for the "legacy user has no auth0Id" duplicate pattern.
 *
 * In this tenant the Auth0 user_id for returning users literally equals the
 * original Mongo _id from last season (after stripping any "auth0|" prefix).
 * So the safest match we can do in advance is:
 *
 *   legacy.auth0Id  <-  String(legacy._id)
 *
 * Once that's set, the backend's `findOne({ auth0Id })` during roster submit
 * will match the existing legacy doc and update it in place, instead of
 * spinning up a second doc for the same person.
 *
 * Safety:
 *   - Only touches users where auth0Id is missing/empty.
 *   - Skips any user whose intended auth0Id is already claimed by another
 *     user doc (would violate the unique index). Those are printed so you
 *     can inspect them manually.
 *   - --dry prints everything without writing.
 *
 * Usage:
 *   node scripts/backfill-legacy-auth0ids.js --dry
 *   node scripts/backfill-legacy-auth0ids.js
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User } = require('../src/models');

const isDryRun = process.argv.includes('--dry');

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB');
  console.log(isDryRun ? '[DRY RUN] no writes will be made\n' : '[APPLY] will write changes\n');

  const users = await User.find({}).lean();
  const legacy = users.filter((u) => !u.auth0Id);
  console.log(`Scanning ${users.length} users; ${legacy.length} are missing auth0Id.\n`);

  // Build a set of auth0Ids already in use so we can skip collisions without
  // hitting the unique index at write time.
  const takenAuth0Ids = new Set(users.filter((u) => u.auth0Id).map((u) => u.auth0Id));

  let updated = 0;
  let conflicts = 0;

  for (const u of legacy) {
    const intended = String(u._id);
    if (takenAuth0Ids.has(intended)) {
      console.log(
        `[conflict] ${u.name} (_id=${u._id}) — auth0Id ${intended} already used by another user`
      );
      conflicts += 1;
      continue;
    }

    console.log(
      `${isDryRun ? 'would set ' : 'setting   '}${u.name} (_id=${u._id}) -> auth0Id=${intended}`
    );

    if (!isDryRun) {
      await User.updateOne({ _id: u._id }, { $set: { auth0Id: intended } });
    }
    takenAuth0Ids.add(intended);
    updated += 1;
  }

  console.log(
    `\nDone. ${isDryRun ? 'would update' : 'updated'} ${updated}, skipped ${conflicts} conflict(s).`
  );

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
