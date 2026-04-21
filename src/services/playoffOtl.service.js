const axios = require('axios');
const httpStatus = require('http-status');
const config = require('../config/config');
const { logger } = require('../config/logger');
const ApiError = require('../utils/ApiError');

const REQUEST_TIMEOUT = 120000; // 2 minutes

// NHL gameState values that mean the game won't change anymore. Boxscores
// for terminal games are cached forever within the process.
const TERMINAL_STATES = new Set(['FINAL', 'OFF']);

// Only games from the NHL playoffs contribute playoff OTL.
const PLAYOFF_GAME_TYPE = 3;

// In-process caches. These live for the lifetime of the Node process, which is
// typically short-lived on Fly (auto-stop machines), so they're a nice-to-have
// optimization rather than a correctness mechanism. Correctness comes from
// stateless recomputation on every run.
const dailyGamesCache = new Map(); // date (YYYY-MM-DD) -> games[] (only cached once ALL games that day are terminal)
const boxscoreCache = new Map(); // gameId -> boxscore (only cached when terminal)

const formatDate = (date) => {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseDate = (str) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Invalid date "${str}" (expected YYYY-MM-DD)`);
  }
  const [y, m, d] = str.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

const fetchGamesForDate = async (dateStr) => {
  if (dailyGamesCache.has(dateStr)) {
    return dailyGamesCache.get(dateStr);
  }

  const url = `${config.nhl.webApi}score/${dateStr}`;
  const resp = await axios.get(url, { timeout: REQUEST_TIMEOUT });
  const games = Array.isArray(resp.data && resp.data.games) ? resp.data.games : [];

  // Only cache the day once every game is terminal — otherwise we'd miss
  // late-finishing games on a subsequent run for the same date.
  const allTerminal = games.length > 0 && games.every((g) => TERMINAL_STATES.has(g.gameState));
  if (allTerminal) {
    dailyGamesCache.set(dateStr, games);
  }
  return games;
};

const fetchBoxscore = async (gameId) => {
  if (boxscoreCache.has(gameId)) {
    return boxscoreCache.get(gameId);
  }

  const url = `${config.nhl.webApi}gamecenter/${gameId}/boxscore`;
  const resp = await axios.get(url, { timeout: REQUEST_TIMEOUT });
  const box = resp.data;

  if (TERMINAL_STATES.has(box && box.gameState)) {
    boxscoreCache.set(gameId, box);
  }
  return box;
};

const findLosingGoalie = (boxscore) => {
  const sides = ['homeTeam', 'awayTeam'];
  for (const side of sides) {
    const goalies = boxscore.playerByGameStats && boxscore.playerByGameStats[side] && boxscore.playerByGameStats[side].goalies;
    if (!Array.isArray(goalies)) continue;
    for (const goalie of goalies) {
      if (goalie && goalie.decision === 'L') return goalie;
    }
  }
  return null;
};

const isPlayoffOtGame = (game) => {
  if (!game) return false;
  if (Number(game.gameType) !== PLAYOFF_GAME_TYPE) return false;
  if (!TERMINAL_STATES.has(game.gameState)) return false;
  const lastPeriodType = game.gameOutcome && game.gameOutcome.lastPeriodType;
  return lastPeriodType === 'OT';
};

/**
 * Walk the NHL schedule from PLAYOFFS_START_DATE through today (UTC), fetch
 * boxscores for every terminal playoff game that ended in OT, and tally the
 * losing goalie for each. Returns a Map<nhl_id, count>.
 *
 * Idempotent by design: re-running always produces the same tally from the same
 * source data, so there is no risk of double-counting.
 *
 * @param {string} [startDateOverride] - optional YYYY-MM-DD override for testing
 * @param {string} [endDateOverride] - optional YYYY-MM-DD override for testing
 * @returns {Promise<{ tally: Map<number, number>, games: Array<{gameId:number, date:string, loserNhlId:number, loserName:string}> }>}
 */
const getPlayoffOtlTallies = async (startDateOverride, endDateOverride) => {
  const startStr = startDateOverride || config.playoffs.startDate;
  if (!startStr) {
    throw new ApiError(
      httpStatus.INTERNAL_SERVER_ERROR,
      'PLAYOFFS_START_DATE is not configured; cannot compute playoff OTL tallies.'
    );
  }

  const start = parseDate(startStr);
  const end = endDateOverride ? parseDate(endDateOverride) : new Date();
  const endStr = formatDate(end);

  if (start > end) {
    throw new ApiError(httpStatus.BAD_REQUEST, `Start date ${startStr} is after end date ${endStr}.`);
  }

  const tally = new Map();
  const contributions = [];

  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  while (cursor <= end) {
    const dateStr = formatDate(cursor);
    let games;
    try {
      games = await fetchGamesForDate(dateStr);
    } catch (error) {
      logger.warn(`Failed to fetch NHL scores for ${dateStr}: ${error.message}`);
      games = [];
    }

    for (const game of games) {
      if (!isPlayoffOtGame(game)) continue;
      try {
        const box = await fetchBoxscore(game.id);
        const loser = findLosingGoalie(box);
        if (!loser || typeof loser.playerId !== 'number') continue;
        tally.set(loser.playerId, (tally.get(loser.playerId) || 0) + 1);
        contributions.push({
          gameId: game.id,
          date: dateStr,
          loserNhlId: loser.playerId,
          loserName: loser.name && loser.name.default,
        });
      } catch (error) {
        logger.warn(`Failed to fetch boxscore for playoff game ${game.id}: ${error.message}`);
      }
    }

    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { tally, games: contributions };
};

/**
 * Convenience wrapper that returns a plain object for JSON responses.
 */
const getPlayoffOtlSnapshot = async (startDateOverride, endDateOverride) => {
  const { tally, games } = await getPlayoffOtlTallies(startDateOverride, endDateOverride);
  return {
    startDate: startDateOverride || config.playoffs.startDate,
    endDate: endDateOverride || formatDate(new Date()),
    totalOtlCredits: games.length,
    distinctGoalies: tally.size,
    byGoalie: Object.fromEntries([...tally.entries()].map(([id, count]) => [id, count])),
    games,
  };
};

module.exports = {
  getPlayoffOtlTallies,
  getPlayoffOtlSnapshot,
};
