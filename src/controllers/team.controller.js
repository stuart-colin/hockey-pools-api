const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { teamService } = require('../services');

const createTeam = catchAsync(async (req, res) => {
  const team = await teamService.createTeam(req.body);
  res.status(httpStatus.CREATED).send(team);
});

const getTeam = catchAsync(async (req, res) => {
  const team = await teamService.getTeamByName(req.params.teamName);
  if (!team) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Team not found');
  }
  res.send(team);
});

const getTeamById = catchAsync(async (req, res) => {
  const team = await teamService.getTeamByID(req.params.teamId);
  if (!team) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Team not found');
  }
  res.send(team);
});

module.exports = {
  createTeam,
  getTeam,
  getTeamById,
};
