const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { franchiseService } = require('../services');

const createFranchise = catchAsync(async (req, res) => {
  const franchise = await franchiseService.createFranchise(req.body);
  res.status(httpStatus.CREATED).send(franchise);
});

const getFranchise = catchAsync(async (req, res) => {
  const franchise = await franchiseService.getFranchiseByName(req.params.franchiseName);
  if (!franchise) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Franchise not found');
  }
  res.send(franchise);
});

const addTeamToFranchise = catchAsync(async (req, res) => {
  const franchise = await franchiseService.addTeamToFranchise(req.body);
  res.send(franchise);
});

module.exports = {
  createFranchise,
  getFranchise,
  addTeamToFranchise,
};
