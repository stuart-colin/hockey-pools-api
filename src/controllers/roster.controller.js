const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const pick = require('../utils/pick');
const { rosterService } = require('../services');

const createRoster = catchAsync(async (req, res) => {
  const roster = await rosterService.createRoster(req.body);
  res.status(httpStatus.CREATED).send(roster);
});

const getRosters = catchAsync(async (req, res) => {
  const filter = pick(req.query, ['name', 'role']);
  const options = pick(req.query, ['sortBy', 'limit', 'page']);
  const result = await rosterService.getRosters(filter, options);
  res.send(result);
});

const getRosterByOwner = catchAsync(async (req, res) => {
  const result = await rosterService.getRosterByOwner(req.params.ownerId);
  res.send(result);
});

const updateRosterByOwner = catchAsync(async (req, res) => {
  const roster = await rosterService.updateUserById(req.params.ownerId, req.body);
  res.send(roster);
});

const deleteRoster = catchAsync(async (req, res) => {
  await rosterService.deleteRosterByOwner(req.params.ownerId);
  res.status(httpStatus.NO_CONTENT).send();
});

module.exports = {
  createRoster,
  getRosters,
  getRosterByOwner,
  updateRosterByOwner,
  deleteRoster,
};
