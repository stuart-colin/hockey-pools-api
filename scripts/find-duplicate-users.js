/* eslint-disable no-console */
/**
 * Diagnose duplicate-looking entries in the Standings:
 *   A. Multiple User docs whose auth0Id differs only by prefix (e.g.
 *      "auth0|abc" vs. "abc") — they show as two rows in Standings.
 *   B. Multiple User docs that share the same display name (could be two
 *      people with the same name, or a real duplicate from a re-signup).
 *   C. Rosters whose `owner` ObjectId doesn't match any User doc — those
 *      render via the populate fallback and may look like a copy of a real
 *      entry.
 *   D. Users with more than one Roster (belt-and-suspenders to the existing
 *      dedupe-rosters script).
 *
 * Read-only.
 *
 * Usage:
 *   node scripts/find-duplicate-users.js
 */
const path = require('path');
const dotenv = require('dotenv');
const mongoose = require('mongoose');

dotenv.config({ path: path.join(__dirname, '..', '.env') });

const { MONGODB_USER, MONGODB_PASS, MONGODB_NAME } = process.env;
const mongoUrl = `mongodb+srv://${MONGODB_USER}:${MONGODB_PASS}@${MONGODB_USER}.limsu.mongodb.net/${MONGODB_NAME}?retryWrites=true&w=majority`;

const { User, Roster } = require('../src/models');

const stripPrefix = (id) => (id && id.includes('|') ? id.split('|').pop() : id);

const printUserAndRoster = async (u) => {
  const roster = await Roster.findOne({ owner: u._id }).lean();
  console.log(
    `User _id=${u._id} auth0Id=${u.auth0Id} name=${JSON.stringify(u.name)}`
  );
  if (roster) {
    console.log(
      `  -> roster _id=${roster._id} updatedAt=${roster.updatedAt?.toISOString?.() || roster.updatedAt}`
    );
  }
};

const run = async () => {
  await mongoose.connect(mongoUrl);
  console.log('Connected to MongoDB\n');

  const users = await User.find({}).lean();
  console.log(`Scanning ${users.length} users.\n`);

  // (A) Duplicates from prefix mismatch — only group users that *have* an
  // auth0Id. A bunch of legacy rows don't have auth0Id at all, which would
  // otherwise collapse them into one giant bucket.
  const byAuth0 = new Map();
  for (const u of users) {
    if (!u.auth0Id) continue;
    const key = stripPrefix(u.auth0Id);
    if (!byAuth0.has(key)) byAuth0.set(key, []);
    byAuth0.get(key).push(u);
  }
  const prefixDupes = [...byAuth0.values()].filter((g) => g.length > 1);
  console.log(`(A) Prefix-mismatch duplicates: ${prefixDupes.length}`);
  for (const group of prefixDupes) {
    console.log('----');
    for (const u of group) await printUserAndRoster(u);
  }
  console.log('');

  // (B) Same display name, different User docs.
  const byName = new Map();
  for (const u of users) {
    const key = (u.name || '').trim().toLowerCase();
    if (!key) continue;
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key).push(u);
  }
  const nameDupes = [...byName.values()].filter((g) => g.length > 1);
  console.log(`(B) Same-name duplicates: ${nameDupes.length}`);
  for (const group of nameDupes) {
    console.log('----');
    for (const u of group) await printUserAndRoster(u);
  }
  console.log('');

  // (C) Orphan rosters — owner doesn't point at any existing User.
  const rosters = await Roster.find({}, { owner: 1, createdAt: 1, updatedAt: 1 }).lean();
  const userIdSet = new Set(users.map((u) => String(u._id)));
  const orphans = rosters.filter(
    (r) => !r.owner || !userIdSet.has(String(r.owner))
  );
  console.log(`(C) Orphan rosters: ${orphans.length}`);
  for (const r of orphans) {
    console.log(
      `roster _id=${r._id} owner=${r.owner} updatedAt=${r.updatedAt?.toISOString?.() || r.updatedAt}`
    );
  }
  console.log('');

  // (D) Users with more than one roster (should be zero after dedupe-rosters).
  const rostersByOwner = new Map();
  for (const r of rosters) {
    if (!r.owner) continue;
    const key = String(r.owner);
    if (!rostersByOwner.has(key)) rostersByOwner.set(key, []);
    rostersByOwner.get(key).push(r);
  }
  const multiRoster = [...rostersByOwner.entries()].filter(([, rs]) => rs.length > 1);
  console.log(`(D) Users with multiple rosters: ${multiRoster.length}`);
  for (const [ownerId, rs] of multiRoster) {
    console.log(
      `owner=${ownerId} -> ${rs.map((r) => r._id).join(', ')}`
    );
  }

  await mongoose.disconnect();
  console.log('\nDone.');
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
