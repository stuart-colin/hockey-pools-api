const _ = require('lodash');
const httpStatus = require('http-status');
const pick = require('../utils/pick');
const catchAsync = require('../utils/catchAsync');
const { playerService } = require('../services');
const ApiError = require('../utils/ApiError');

const getPlayers = catchAsync(async (req, res) => {
  let filter = pick(req.query, ['nhl_id', 'name', 'active', 'position', 'headshot']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);

  // For filter.name change to make omnisearch
  filter = _.mapValues(filter, (searchValue, searchKey) => {
    if (_.isEqual(searchKey, 'name')) {
      return { $regex: searchValue, $options: 'i' };
    } else {
      return searchValue;
    }
  });
  const result = await playerService.queryPlayers(filter, options);
  res.send(result);
});

const getPlayer = catchAsync(async (req, res) => {
  const player = await playerService.getPlayerById(req.params.playerId);
  if (!player) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  res.send(player);
});

const cachePlayer = catchAsync(async (req, res) => {
  const player = await playerService.cachePlayerById(req.params.playerId);
  res.send(player);
});

const cachePlayers = catchAsync(async (req, res) => {
  const players = await playerService.cachePlayers();
  res.send(players);
});

const updatePlayer = catchAsync(async (req, res) => {
  const player = await playerService.updatePlayerById(req.params.playerId, req.body);
  res.send(player);
});

const updateOTL = catchAsync(async (req, res) => {
  const player = await playerService.updatePlayerOTL(req.params.playerId, req.body.otl);
  res.send(player);
});

const createPlayer = catchAsync(async (req, res) => {
  const player = await playerService.createPlayerById(req.body.id);
  res.status(httpStatus.CREATED).send(player);
});

const deletePlayer = catchAsync(async (req, res) => {
  await playerService.deletePlayerById(req.params.playerId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  getPlayers,
  createPlayer,
  getPlayer,
  updatePlayer,
  updateOTL,
  deletePlayer,
  cachePlayer,
  cachePlayers,
};
