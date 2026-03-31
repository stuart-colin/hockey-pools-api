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

const getBaseApi = async () => {
  try {
    const baseApi = await axios.get(config.nhl.statsApi, { timeout: REQUEST_TIMEOUT });
    return baseApi.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get base API');
  }
};

const getStandingsNow = async () => {
  try {
    const standings = await axios.get(`${config.nhl.statsApi}standings/now`, { timeout: REQUEST_TIMEOUT });
    return standings.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get standings');
  }
};

const getScoresNow = async () => {
  try {
    const scores = await axios.get(`${config.nhl.statsApi}score/now`, { timeout: REQUEST_TIMEOUT });

    return scores.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get scores');
  }
};

const getScoresByDate = async (date) => {
  try {
    const scores = await axios.get(`${config.nhl.statsApi}score/${date}`, { timeout: REQUEST_TIMEOUT });
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

const getStats = async (query) => {
  try {
    const stats = await axios.get(`https://api.nhle.com/stats/rest/en/${query}`, { timeout: REQUEST_TIMEOUT });
    return stats.data;
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, `Unable to get stats for query ${query}`);
  }
};

// const getTeams = async () => {
//   try {
//     const teams = await axios.get(`https://api.nhle.com/stats/rest/en/team`,
//       { timeout: REQUEST_TIMEOUT }
//     );
//     return teams.data;
//   } catch (error) {
//     logger.error(error);
//     throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get teams');
//   }
// };


// const getPlayerStats = async () => {
//   try {
//     const stats = await axios.get(
//       `https://api.nhle.com/stats/rest/en/skater/summary?limit=-1&sort=points&gameType=2&cayenneExp=seasonId=20252026`,
//       { timeout: REQUEST_TIMEOUT }
//     );
//     return stats.data;
//   } catch (error) {
//     logger.error(error);
//     throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get player stats');
//   }
// };
// const getGoalieStats = async () => {
//   try {
//     const stats = await axios.get(
//       `https://api.nhle.com/stats/rest/en/goalie/summary?limit=-1&sort=wins&gameType=2&cayenneExp=seasonId=20252026`,
//       { timeout: REQUEST_TIMEOUT }
//     );
//     return stats.data;
//   } catch (error) {
//     logger.error(error);
//     throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get goalie stats');
//   }
// };

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
    const player = await axios.get(`${config.nhl.statsApi}player/${playerID}/landing`);
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
    const player = await axios.get(`${config.nhl.statsApi}player/${playerID}/landing`);
    const teamName = player.data.fullTeamName.default;
    const teamAbbrev = player.data.currentTeamAbbrev;
    const teamLogo = player.data.teamLogo;
    const season = player.data.featuredStats.season;
    const featuredStats = player.data.featuredStats;
    if (season !== '20252026' && featuredStats.playoffs === undefined) {
      return {
        stats: {
          featuredStats: {
            playoffs: {
              subSeason: {
                goals: 0,
                assists: 0,
                otGoals: 0,
                wins: 0,
                shutouts: 0,
                otLosses: 0,
              },
            },
          },
          teamName,
          teamAbbrev,
          teamLogo,
          otl: 0,
        },
      };
    } else {
      return { stats: { featuredStats, teamName, teamAbbrev, teamLogo } };
    }
  } catch (error) {
    logger.error(error);
    throw new ApiError(httpStatus.NOT_FOUND, 'Unable to get player stats');
  }
};

module.exports = {
  // getTeams,
  getBaseApi,
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
