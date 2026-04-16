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

// Namespace used by the Auth0 post-login Action that injects user_metadata
// as custom claims on the access token. Must match the namespace used in
// the Action's setCustomClaim() calls.
const PROFILE_CLAIMS_NAMESPACE = 'https://bps-annual-hockey-pool.netlify.app/';

const submitRoster = catchAsync(async (req, res) => {
  // Extract user data from decoded JWT token
  const decodedToken = req.user;
  const userInfo = req.userInfo;

  // Extract just the ID part (e.g., "auth0|..." -> "...")
  const auth0Id = decodedToken.sub.includes('|')
    ? decodedToken.sub.split('|').pop()
    : decodedToken.sub;

  // Auth0 post-login Action copies user_metadata.{name,region,country} onto
  // the access token as namespaced custom claims. /userinfo.name falls back
  // to the email for DB-connection users, so the custom claim is strictly
  // better when present.
  const claimName = decodedToken[`${PROFILE_CLAIMS_NAMESPACE}name`];
  const claimRegion = decodedToken[`${PROFILE_CLAIMS_NAMESPACE}region`];
  const claimCountry = decodedToken[`${PROFILE_CLAIMS_NAMESPACE}country`];

  const user = {
    auth0Id,
    name: claimName || userInfo.name || '',
    region: claimRegion || '',
    country: claimCountry || '',
  };

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
