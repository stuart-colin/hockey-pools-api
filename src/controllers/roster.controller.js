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

const submitRoster = catchAsync(async (req, res) => {
  // Extract user data from decoded JWT token
  const decodedToken = req.user;
  const userInfo = req.userInfo;

  const user = {
    auth0Id: decodedToken.sub, // Full Auth0 sub for lookup/authentication
    name: userInfo.name || '', // Get name from /userinfo
  };

  console.log('submitRoster - decodedToken.sub:', decodedToken.sub);
  console.log('submitRoster - user object being passed:', user);

  const roster = await rosterService.submitRoster(user, req.body);
  if (!roster) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'Unable to submit roster');
  } else {
    res.status(httpStatus.CREATED).send(roster);
  }
});

module.exports = {
  submitRoster,
  createRoster,
  getRosters,
  getRosterByOwner,
  updateRosterByOwner,
  deleteRoster,
};
