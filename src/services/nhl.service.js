const httpStatus = require('http-status');
const axios = require('axios');
const _ = require('lodash');
const config = require('../config/config');
// const draftPlayerService = require('../services/draftplayer.service');
const { logger } = require('../config/logger');
const ApiError = require('../utils/ApiError');
const fs = require('fs').promises;
const path = require('path');

const REQUEST_TIMEOUT = 120000; // 2 minutes in milliseconds

const getWebApi = async (query) => {
  try {
    const url = `${config.nhl.webApi}${query}`;
    const resp = await axios.get(url, { timeout: REQUEST_TIMEOUT });
    return resp.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, `Unable to proxy NHL API for query ${query}`);
  }
};

const getStandingsNow = async () => {
  try {
    const standings = await axios.get(`${config.nhl.webApi}standings/now`, { timeout: REQUEST_TIMEOUT });
    return standings.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get standings');
  }
};

const getScoresNow = async () => {
  try {
    const scores = await axios.get(`${config.nhl.webApi}score/now`, { timeout: REQUEST_TIMEOUT });

    return scores.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get scores');
  }
};

const getScoresByDate = async (date) => {
  try {
    const scores = await axios.get(`${config.nhl.webApi}score/${date}`, { timeout: REQUEST_TIMEOUT });
    return scores.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, `Unable to get scores for date ${date}`);
  }
};

// const getPlayerStats = async () => {
//   try {
//     const filePath = path.join(__dirname, 'playerstats.json');
//     const data = await fs.readFile(filePath, 'utf8');
//     const playerStatsData = JSON.parse(data);
//     return playerStatsData;
//   } catch (error) {
//     logger.error('Error reading or parsing playerstats.json:', error);
//     throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unable to get player stats from file');
//   }
// };
// const getGoalieStats = async () => {
//   try {
//     const filePath = path.join(__dirname, 'goaliestats.json');
//     const data = await fs.readFile(filePath, 'utf8');
//     const goalieStatsData = JSON.parse(data);
//     return goalieStatsData;
//   } catch (error) {
//     logger.error('Error reading or parsing playerstats.json:', error);
//     throw new ApiError(httpStatus.INTERNAL_SERVER_ERROR, 'Unable to get player stats from file');
//   }
// };

const getRestApi = async (query) => {
  try {
    const resp = await axios.get(`${config.nhl.restApi}${query}`, { timeout: REQUEST_TIMEOUT });
    return resp.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, `Unable to proxy NHL REST API for query ${query}`);
  }
};

const getStats = async (query) => {
  try {
    const stats = await axios.get(`${config.nhl.restApi}stats/rest/en/${query}`, { timeout: REQUEST_TIMEOUT });
    return stats.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, `Unable to get stats for query ${query}`);
  }
};

/**
 * Query the NHL API for a player ID
 * @param {string} playerName
 * @returns {(object|Array)}
 */
const queryForPlayerID = async (playerName) => {
  // Make the query to get the player data from the NHL
  let response;
  try {
    response = await axios.get(`${config.nhl.suggestApi}minplayers/${playerName}`);
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }

  // Parse the data and get the player ID
  let suggestedPlayers;
  if (!_.isEmpty(response.data.suggestions)) {
    // map the player ID's
    // if (response.data.suggestions.length > 1) {
    suggestedPlayers = _.map(response.data.suggestions, (player) => {
      const split = _.split(player, '|');
      const playerNameID = split[split.length - 1];
      const playerNameIDObject = {};
      const playerNameIDSplit = _.split(playerNameID, '-');
      playerNameIDObject.playerID = playerNameIDSplit[playerNameIDSplit.length - 1];
      playerNameIDSplit.pop();
      playerNameIDObject.playerName = _.join(playerNameIDSplit, ' ');
      playerNameIDObject.playerTeam = split[split.length - 4];
      return playerNameIDObject;
    });
  }
  /*else {
    const draftPlayer = await draftPlayerService.getPlayersByName(playerName);
    if (!_.isEmpty(draftPlayer)) {
      const playerDrafted = [];
      playerDrafted.push({ playerID: draftPlayer.playerId, playerName: draftPlayer.playerName });
      return playerDrafted;
    } else {
      throw new ApiError(httpStatus.NOT_FOUND, `Player: \n${playerName}\n not found`);
    }
  }*/
  return suggestedPlayers;
};

/**
 * Query the NHL API for a player by looking by their ID
 * @param {Number} playerID
 * @returns {(object|Array)}
 */
const queryForPlayerByID = async (playerID) => {
  try {
    const player = await axios.get(`${config.nhl.webApi}player/${playerID}/landing`);
    return player.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found or Player ID invalid');
  }
};

/**
 * Query the NHL API for a player by looking by their ID
 * @param {Number} playerID
 * @returns {(object|Array)}
 */
const queryForPlayerStats = async (playerID, year) => {
  try {
    const player = await axios.get(`${config.nhl.webApi}player/${playerID}/landing`);

    // NHL's landing endpoint can legitimately omit these fields for players
    // without an active NHL roster spot (waived, AHL assignment, long-term IR,
    // unsigned, retired mid-season). We keep them in the DB anyway so their
    // prior stats persist, just fall back to empty values.
    const teamName = player.data.fullTeamName?.default || '';
    const teamAbbrev = player.data.currentTeamAbbrev || '';
    const teamLogo = player.data.teamLogo || '';
    const featuredStats = player.data.featuredStats || null;
    const season = featuredStats?.season || '';

    // Empty playoffs placeholder used whenever the NHL hasn't populated
    // playoff featured stats yet (pre-playoffs, or player had no featuredStats
    // at all).
    const emptyPlayoffs = {
      subSeason: {
        goals: 0,
        assists: 0,
        otGoals: 0,
        wins: 0,
        shutouts: 0,
        otLosses: 0,
      },
    };

    if (!featuredStats) {
      return {
        stats: {
          featuredStats: { playoffs: emptyPlayoffs },
          teamName,
          teamAbbrev,
          teamLogo,
          otl: 0,
        },
      };
    }

    if (season !== '20252026' && featuredStats.playoffs === undefined) {
      return {
        stats: {
          featuredStats: { playoffs: emptyPlayoffs },
          teamName,
          teamAbbrev,
          teamLogo,
          otl: 0,
        },
      };
    }

    return { stats: { featuredStats, teamName, teamAbbrev, teamLogo } };
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get player stats');
  }
};

module.exports = {
  // getTeams,
  getWebApi,
  getRestApi,
  getStandingsNow,
  getScoresNow,
  getScoresByDate,
  getStats,
  // getPlayerStats,
  // getGoalieStats,
  queryForPlayerStats,
  queryForPlayerID,
  queryForPlayerByID,
};
