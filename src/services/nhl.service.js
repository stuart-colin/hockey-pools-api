const httpStatus = require('http-status');
const axios = require('axios');
const _ = require('lodash');
const config = require('../config/config');
// const draftPlayerService = require('../services/draftplayer.service');
const { logger } = require('../config/logger');
const ApiError = require('../utils/ApiError');

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
    if (season !== '20242025' && featuredStats.playoffs === undefined) {
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
              }
            }
          },
          teamName,
          teamAbbrev,
          teamLogo,
          otl: 0
        }
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
  queryForPlayerStats,
  queryForPlayerID,
  queryForPlayerByID,
};
