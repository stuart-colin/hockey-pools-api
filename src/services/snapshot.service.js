const { Roster, RosterSnapshot } = require('../models');
const config = require('../config/config');
const { logger } = require('../config/logger');

// Pool scoring rules. Mirrors the frontend `src/utils/points.js` exactly so a
// snapshot's total matches what the leaderboard renders for the same point in
// time.
const calculateSkaterPoints = (goals = 0, assists = 0, otGoals = 0) =>
  (goals || 0) + (assists || 0) + (otGoals || 0);

const calculateGoaliePoints = (wins = 0, shutouts = 0, otl = 0) =>
  ((wins || 0) * 2) + ((shutouts || 0) * 2) + (otl || 0);

const POSITION_ARRAYS = ['center', 'left', 'right', 'defense', 'goalie'];

/**
 * Read the playoff sub-season slice off a populated Player document and
 * compute pool points using the same rules the frontend applies. Mirrors
 * `src/utils/normalizePlayer.js`.
 *
 * @param {Object} player - populated Player document with `stats` set.
 * @returns {number}
 */
const computePlayerPoints = (player) => {
  if (!player) return 0;
  const sub = player.stats?.featuredStats?.playoffs?.subSeason;
  if (!sub) return 0;
  if (player.position === 'G') {
    const otl = player.stats?.otl ?? sub.otLosses ?? 0;
    return calculateGoaliePoints(sub.wins, sub.shutouts, otl);
  }
  return calculateSkaterPoints(sub.goals, sub.assists, sub.otGoals);
};

/**
 * Sum points across every roster slot. The Roster argument must already be
 * populated (center/left/right/defense/goalie are arrays; utility is a single
 * Player ref).
 */
const computeRosterTotals = (roster) => {
  if (!roster) return { points: 0 };
  let points = 0;
  for (const pos of POSITION_ARRAYS) {
    const players = roster[pos];
    if (!Array.isArray(players)) continue;
    for (const player of players) {
      points += computePlayerPoints(player);
    }
  }
  if (roster.utility) {
    points += computePlayerPoints(roster.utility);
  }
  return { points };
};

/**
 * Determine the season string (year of the playoff finals) from config.
 * Falls back to current calendar year, biasing post-summer dates forward.
 */
const inferCurrentSeason = () => {
  const start = config.playoffs?.startDate;
  if (start && /^\d{4}-/.test(start)) {
    return start.slice(0, 4);
  }
  const now = new Date();
  const year = now.getUTCFullYear();
  // Aug-Dec belong to the next NHL season's "year".
  return now.getUTCMonth() >= 7 ? String(year + 1) : String(year);
};

/**
 * Compute "yesterday" in YYYY-MM-DD using UTC. Run at noon ET (16:00 UTC),
 * `now - 24h` is yesterday in both UTC and ET.
 */
const computeYesterdayDate = (referenceDate = new Date()) => {
  const d = new Date(referenceDate.getTime() - 24 * 60 * 60 * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const isValidDateStr = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

/**
 * Take a snapshot row per current Roster for the given season+date.
 *
 * Reads totals from the *currently* stored `Player.stats` — which is what the
 * caller (the noon-ET cron) just refreshed. Idempotent: running the same
 * season+date twice replaces existing rows.
 *
 * Returns a small summary suitable for logging.
 *
 * @param {{ season?: string, date?: string }} [opts]
 */
const runDailySnapshot = async ({ season, date } = {}) => {
  const seasonStr = season || inferCurrentSeason();
  const dateStr = date || computeYesterdayDate();
  if (!isValidDateStr(dateStr)) {
    throw new Error(`Invalid snapshot date "${dateStr}" (expected YYYY-MM-DD)`);
  }

  const rosters = await Roster.find({})
    .populate('center')
    .populate('left')
    .populate('right')
    .populate('defense')
    .populate('goalie')
    .populate('utility')
    .populate('owner');

  // Compute totals first; we need them all before we can rank.
  const computed = [];
  for (const roster of rosters) {
    if (!roster.owner) {
      // Orphaned roster (User was deleted out from under it). Skip it
      // rather than write an unattributable snapshot.
      continue;
    }
    const { points } = computeRosterTotals(roster);
    computed.push({
      roster: roster._id,
      owner: roster.owner._id,
      ownerName: roster.owner.name || 'Unknown',
      points,
    });
  }

  // Dense competition rank (1, 2, 2, 4) by points desc.
  computed.sort((a, b) => b.points - a.points);
  let lastPoints = null;
  let lastRank = 0;
  computed.forEach((row, idx) => {
    if (row.points !== lastPoints) {
      lastRank = idx + 1;
      lastPoints = row.points;
    }
    row.rank = lastRank;
  });

  // Idempotent upsert.
  const ops = computed.map((row) => ({
    updateOne: {
      filter: { roster: row.roster, date: dateStr },
      update: {
        $set: {
          season: seasonStr,
          date: dateStr,
          owner: row.owner,
          ownerName: row.ownerName,
          points: row.points,
          rank: row.rank,
        },
      },
      upsert: true,
    },
  }));

  if (ops.length > 0) {
    await RosterSnapshot.bulkWrite(ops, { ordered: false });
  }

  logger.info(
    `Daily snapshot complete: season=${seasonStr} date=${dateStr} rosters=${computed.length}`
  );

  return { season: seasonStr, date: dateStr, rosters: computed.length };
};

/**
 * Slim time-series payload for the chart. Returns one row per roster with a
 * dense `points` array aligned to `dates`. Missing days for a given roster are
 * carried forward from the prior day so the line stays continuous.
 */
const getTimeseries = async ({ season, from, to } = {}) => {
  if (!season) {
    throw new Error('season is required');
  }

  const filter = { season };
  if (from || to) {
    filter.date = {};
    if (from) filter.date.$gte = from;
    if (to) filter.date.$lte = to;
  }

  const docs = await RosterSnapshot.find(filter).sort({ date: 1 }).lean();

  const dateSet = new Set();
  const rosterMap = new Map(); // rosterId -> { owner, ownerName, byDate: Map<date, points> }
  for (const doc of docs) {
    dateSet.add(doc.date);
    const key = String(doc.roster);
    if (!rosterMap.has(key)) {
      rosterMap.set(key, {
        rosterId: key,
        owner: String(doc.owner),
        ownerName: doc.ownerName,
        byDate: new Map(),
      });
    }
    rosterMap.get(key).byDate.set(doc.date, doc.points);
  }

  const dates = [...dateSet].sort();
  const series = [...rosterMap.values()].map(({ rosterId, owner, ownerName, byDate }) => {
    let last = 0;
    const points = dates.map((d) => {
      if (byDate.has(d)) {
        last = byDate.get(d);
      }
      return last;
    });
    return { rosterId, owner, ownerName, points };
  });

  return { season, dates, series };
};

const getStandingsAtDate = async ({ season, date } = {}) => {
  if (!season) throw new Error('season is required');
  if (!isValidDateStr(date)) throw new Error(`Invalid date "${date}"`);
  const docs = await RosterSnapshot.find({ season, date })
    .sort({ rank: 1, points: -1 })
    .lean();
  return docs.map((d) => ({
    rosterId: String(d.roster),
    owner: String(d.owner),
    ownerName: d.ownerName,
    points: d.points,
    rank: d.rank,
    playersRemaining: d.playersRemaining ?? null,
  }));
};

const listAvailableDates = async ({ season } = {}) => {
  if (!season) throw new Error('season is required');
  const dates = await RosterSnapshot.distinct('date', { season });
  return dates.sort();
};

module.exports = {
  computePlayerPoints,
  computeRosterTotals,
  inferCurrentSeason,
  computeYesterdayDate,
  runDailySnapshot,
  getTimeseries,
  getStandingsAtDate,
  listAvailableDates,
};
