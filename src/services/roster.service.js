const _ = require('lodash');
const httpStatus = require('http-status');
const { Roster, User, Player } = require('../models');
const { playerService, nhlService } = require('../services');
const userService = require('../services/user.service');
const ApiError = require('../utils/ApiError');

/**
 * Create a roster
 * @param {Object} rosterBody
 * @returns {Promise<Roster>}
 */
const createRoster = async (rosterBody) => {
  let roster = {
    center: [],
    left: [],
    right: [],
    defense: [],
    goalie: [],
    utility: [],
  };
  if (_.has(rosterBody, 'owner')) {
    if (!(await User.isUserExistId(rosterBody.owner))) {
      throw new ApiError(httpStatus.BAD_REQUEST, 'User does not exist');
    } else {
      //CENTER
      for (let i = 0; i < rosterBody.center.length; i++) {
        const player = rosterBody.center[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.center.push(createdPlayer._id);
      }

      //LEFT
      for (let i = 0; i < rosterBody.left.length; i++) {
        const player = rosterBody.left[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.left.push(createdPlayer._id);
      }

      //right
      for (let i = 0; i < rosterBody.right.length; i++) {
        const player = rosterBody.right[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.right.push(createdPlayer._id);
      }

      //defense
      for (let i = 0; i < rosterBody.defense.length; i++) {
        const player = rosterBody.defense[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.defense.push(createdPlayer._id);
      }

      //goalie
      for (let i = 0; i < rosterBody.goalie.length; i++) {
        const player = rosterBody.goalie[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.goalie.push(createdPlayer._id);
      }

      //utility
      for (let i = 0; i < rosterBody.utility.length; i++) {
        const player = rosterBody.utility[i];
        let createdPlayer;
        if (await Player.isPlayerExistID(player)) {
          createdPlayer = await playerService.getPlayerByNHLId(player);
        } else {
          createdPlayer = await playerService.createPlayerById(player);
        }
        roster.utility.push(createdPlayer._id);
      }
    }
    roster.owner = rosterBody.owner;
  }

  //TODO: Validate that the rosters are actually the right positions
  return Roster.create(roster);
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
const getRosters = async (filter, options) => {
  options.populate = 'left,right,center,defense,goalie,utility,owner';
  const rosters = await Roster.paginate(filter, options);
  for (let i = 0; i < rosters.results.length; i++) {
    const roster = rosters.results[i];
    // roster.center = await Promise.all(_.map(roster.center, playerService.getPlayerById));
    // roster.left = await Promise.all(_.map(roster.left, playerService.getPlayerById));
    // roster.right = await Promise.all(_.map(roster.right, playerService.getPlayerById));
    // roster.defense = await Promise.all(_.map(roster.defense, playerService.getPlayerById));
    // roster.goalie = await Promise.all(_.map(roster.goalie, playerService.getPlayerById));
    // roster.utility = await playerService.getPlayerById(roster.utility);
  }
  return rosters;
};

/**
 * Get roster by owner ID
 * @param {string} owner
 * @returns {Promise<Roster>}
 */
const getRosterByOwner = async (owner) => {
  let rosterRaw = Roster.findOne({ owner: owner })
    .populate('center')
    .populate('left')
    .populate('right')
    .populate('defense')
    .populate('goalie')
    .populate('utility')
    .populate('owner');
  let roster = await rosterRaw;

  return roster;
};

/**
 * Update roster by owner id
 * @param {ObjectId} ownerId
 * @param {Object} updateBody
 * @returns {Promise<User>}
 */
const updateRosterById = async (ownerId, updateBody) => {
  const owner = await userService.getUserById(ownerId);
  if (!owner) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User not found');
  }

  const roster = await getRosterByOwner(ownerId);
  if (!roster) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Roster not found');
  }

  // lets just recreate the roster
  const deletedRoster = await deleteRosterByOwner(ownerId);
  const newRoster = await createRoster(updateBody);
  return roster;
};

/**
 * Delete user by id
 * @param {ObjectId} ownerId
 * @returns {Promise<Roster>}
 */
const deleteRosterByOwner = async (ownerId) => {
  const roster = await getRosterByOwner(ownerId);

  if (!roster) {
    throw new ApiError(httpStatus.NOT_FOUND, 'User does not have a roster');
  }
  await Roster.deleteOne({ owner: ownerId });
  return roster;
};

async function pullPlayerStats(player) {
  let playerStats = await nhlService.queryForPlayerStats(player.nhl_id, '');
  if (player.stats !== undefined) {
    Object.assign(player.stats, playerStats.stats);
  } else {
    player.stats = playerStats.stats;
  }
  player.team = playerStats.team;
  return await player;
}

const submitRoster = async (user, data) => {
  // check to see if the user exists in the users table by auth0Id
  let dbUser = await User.findOne({ auth0Id: user.auth0Id });
  if (!dbUser) {
    // User doesn't exist, create them
    dbUser = await userService.createUser(user);
  }

  // Always trust the server-side User._id as the roster owner. The frontend
  // sends its best guess from the Auth0 sub, but that only happens to match
  // User._id for legacy users; new users get a fresh Mongo ObjectId and would
  // otherwise end up with owner references that don't populate.
  data.owner = dbUser._id;

  // check to see if the user has a roster
  let roster = await getRosterByOwner(dbUser._id);
  if (!roster) {
    // create the roster
    roster = await createRoster(data);
  } else {
    // update the roster
    roster = await updateRosterById(dbUser._id, data);
  }

  return roster;
};

module.exports = {
  submitRoster,
  getRosters,
  createRoster,
  getRosterByOwner,
  updateRosterById,
  deleteRosterByOwner,
};
