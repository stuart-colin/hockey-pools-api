const _ = require('lodash');
const httpStatus = require('http-status');
const nhlService = require('./nhl.service');
const playoffOtlService = require('./playoffOtl.service');
const config = require('../config/config');
const { toJSON } = require('../models/plugins/');
const { Player } = require('../models');
const ApiError = require('../utils/ApiError');
const { transactionLogger, logger } = require('../config/logger');
const { object } = require('joi');

/**
 * Create a player by their name
 * @param {string} playerName
 * @returns {Promise<Player>}
 */
const createPlayerByName = async (playerName) => {
  if (await Player.isPlayerExist(playerName)) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Player already exists');
  }
  let player;
  try {
    player = await nhlService.queryForPlayerID(playerName);
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, error);
  }
  if (player.length > 1) {
    throw new ApiError(httpStatus.UNPROCESSABLE_ENTITY, `found ${player.length} players in request`);
  } else {
    // get the player info from the player ID
    const playerInfo = await nhlService.queryForPlayerByID(player.playerID);
    const playerData = {
      nhl_id: playerInfo.playerId,
      name: playerInfo.firstName.default + ' ' + playerInfo.lastName.default,
      position: playerInfo.position,
      headshot: playerInfo.headshot,
    };
    return Player.create(playerData);
  }
};

/**
 * Query for users
 * @param {Object} filter - Mongo filter
 * @param {Object} options - Query options
 * @param {string} [options.sortBy] - Sort option in the format: sortField:(desc|asc)
 * @param {number} [options.limit] - Maximum number of results per page (default = 10)
 * @param {number} [options.page] - Current page (default = 1)
 * @returns {Promise<QueryResult>}
 */
const queryPlayers = async (filter, options) => {
  const players = await Player.paginate(filter, options);
  return players;
};

/**
 * Create a player by their id
 * @param {string} playerId
 * @returns {Promise<Player>}
 */
const createPlayerById = async (playerId) => {
  if (await Player.isPlayerExistID(playerId)) {
    return getPlayerByNHLId(playerId);
    // throw new ApiError(httpStatus.BAD_REQUEST, 'Player already exists');
  }

  let player;
  try {
    player = await nhlService.queryForPlayerByID(playerId);
    console.log(player);
  } catch (error) {
    throw new ApiError(httpStatus.BAD_REQUEST, error);
  }

  const playerData = {
    nhl_id: player.playerId,
    name: player.firstName.default + ' ' + player.lastName.default,
    position: player.position,
    headshot: player.headshot,
  };
  const createdPlayer = await Player.create(playerData);

  // Auto-fetch and populate stats for newly created player
  try {
    const playerStats = await nhlService.queryForPlayerStats(player.playerId, '');
    if (playerStats) {
      createdPlayer.stats = playerStats.stats;
      await createdPlayer.save();
    }
  } catch (error) {
    logger.warn(`Could not auto-cache stats for player ${player.playerId}`, error);
    // Don't fail player creation if stats fetching fails
  }

  return createdPlayer;
};

/**
 * Get player by id
 * @param {ObjectId} id
 * @returns {Promise<Player>}
 */
const getPlayerById = async (id) => {
  let playerRaw = Player.findById(id);
  let player = await playerRaw;
  // let playerStats = await nhlService.queryForPlayerStats(player.nhl_id, '');
  // if (player.stats !== undefined) {
  //   Object.assign(player.stats, playerStats);
  // } else {
  //   player.stats = playerStats;
  // }
  return player;
};

/**
 * Cache a single player's stats from the NHL API.
 *
 * For goalies, OTL is handled specially because the NHL does not track playoff
 * OT losses. When an `otlTally` is passed in (from the daily cachePlayers run),
 * we overwrite `stats.otl` with the tallied value. When called ad-hoc (e.g.
 * cache a single player via the /cache/:playerId route) no tally is provided,
 * so we preserve the last known stored value and let the next daily run correct
 * it.
 *
 * @param {ObjectId} id
 * @param {Map<number, number>} [otlTally] - optional Map<nhl_id, otlCount>
 * @returns {Promise<Player>}
 */
const cachePlayerById = async (id, otlTally) => {
  const player = await getPlayerById(id);
  const playerStats = await nhlService.queryForPlayerStats(player.nhl_id, '');
  if (!player) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  if (player.position === 'G') {
    const storedOtl = player.stats?.otl || 0;
    if (otlTally) {
      const tallyOtl = otlTally.get(player.nhl_id) || 0;
      playerStats.stats.otl = tallyOtl;
      if (tallyOtl !== storedOtl) {
        logger.info(`OTL change for ${player.name} (${player.nhl_id}): ${storedOtl} -> ${tallyOtl}`);
      }
    } else {
      playerStats.stats.otl = storedOtl;
    }
  }
  player.stats = playerStats.stats;
  await player.save();
  return player;
};

/**
 * Cache every player. Builds a playoff OTL tally once per run (if a playoff
 * start date is configured) and passes it to each goalie's cache step so we
 * don't recompute it N times or risk different goalies seeing different tallies
 * mid-run.
 */
const cachePlayers = async () => {
  const players = await queryPlayers({}, { limit: 1000 });

  // Compute once per run, not per player.
  let otlTally = null;
  if (config.playoffs.startDate) {
    try {
      const { tally, games } = await playoffOtlService.getPlayoffOtlTallies();
      otlTally = tally;
      logger.info(`Computed playoff OTL tally: ${tally.size} goalies across ${games.length} OT games.`);
    } catch (error) {
      logger.warn(`Failed to compute playoff OTL tally; falling back to stored OTL: ${error.message}`);
    }
  } else {
    logger.warn('PLAYOFFS_START_DATE not configured; goalie OTL will be preserved from stored value.');
  }

  const results = [];
  for (let i = 0; i < players.results.length; i++) {
    const player = players.results[i];
    if (!player) {
      continue;
    }

    try {
      await cachePlayerById(player._id, otlTally);
      results.push({ nhl_id: player.nhl_id, status: 'success' });
    } catch (error) {
      logger.warn(`Failed to cache player ${player.nhl_id}: ${error.message}`);
      results.push({ nhl_id: player.nhl_id, status: 'failed', error: error.message });
    }
  }
  return { status: 'success' };
};

/**
 * Get player by id
 * @param {ObjectId} id
 * @returns {Promise<Player>}
 */
const getPlayerByNHLId = async (nhlId) => {
  let playerRaw = Player.findOne({ nhl_id: nhlId });
  let player = await playerRaw;
  let playerStats = await nhlService.queryForPlayerStats(player.nhl_id, '');
  if (player.stats !== undefined) {
    Object.assign(player.stats, playerStats.stats);
  } else {
    player.stats = playerStats;
  }
  return player;
};

/**
 * Update player by id
 * @param {ObjectId} playerId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updatePlayerById = async (playerId, updateBody) => {
  console.log(playerId);
  const player = await getPlayerById(playerId);
  if (!player) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  Object.assign(player, updateBody);
  await player.save();
  return player;
};

/**
 * Update player (goalies only) Overtime Losses
 * @param {ObjectId} playerId
 * @param {Integer} numLosses
 * @returns {Promise<Player>}
 */
const updatePlayerOTL = async (playerId, otl) => {
  console.log(playerId);
  console.log(otl);

  let playerRaw = Player.findById(playerId);
  let player = await playerRaw;
  if (!player) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  if (player.position !== 'G') {
    throw new ApiError(httpStatus.NOT_ACCEPTABLE, `Player is of position ${player.position}, must be of type 'G'`);
  }
  // if the player does not have a stats object, create one
  if (player.stats === undefined) {
    player.stats = {
      otl: otl,
    };
  } else {
    // Update existing stats with the new OTL value
    player.stats.otl = otl;
  }
  // Mark the nested object as modified so Mongoose saves it
  player.markModified('stats');
  await player.save();
  return player;
};

/**
 * Get player by Name
 * @param {string} playerName
 * @returns {Promise<Team>}
 */
const getPlayerByName = async (playerName) => {
  console.log(playerName);
  transactionLogger.info(`Searching for player by name: ${playerName}`);
  return Player.findOne({ name: { $regex: playerName, $options: 'i' } });
};

const deletePlayerById = async (playerId) => {
  const player = await getPlayerById(playerId);
  if (!player) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  await player.remove();
  return player;
};

module.exports = {
  queryPlayers,
  createPlayerByName,
  createPlayerById,
  updatePlayerById,
  updatePlayerOTL,
  getPlayerById,
  getPlayerByNHLId,
  getPlayerByName,
  deletePlayerById,
  cachePlayerById,
  cachePlayers,
};
