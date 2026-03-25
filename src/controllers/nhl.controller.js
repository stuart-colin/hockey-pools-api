const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { nhlService } = require('../services');

const queryForPlayerID = catchAsync(async (req, res) => {
  //   console.log(req.body.name);
  const player = await nhlService.queryForPlayerID(req.body.name);
  res.status(httpStatus.OK).send(player);
});

const queryForPlayerByID = catchAsync(async (req, res) => {
  const player = await nhlService.queryForPlayerByID(req.body.id);
  res.status(httpStatus.OK).send(player);
});

const getScoresNow = catchAsync(async (req, res) => {
  const scores = await nhlService.getScoresNow();
  res.status(httpStatus.OK).send(scores);
});

const getStandingsNow = catchAsync(async (req, res) => {
  const standings = await nhlService.getStandingsNow();
  res.status(httpStatus.OK).send(standings);
});

const getPlayerStats = catchAsync(async (req, res) => {
  const stats = await nhlService.getPlayerStats();
  res.status(httpStatus.OK).send(stats);
});

const getGoalieStats = catchAsync(async (req, res) => {
  const stats = await nhlService.getGoalieStats();
  res.status(httpStatus.OK).send(stats);
});

module.exports = {
  getScoresNow,
  getStandingsNow,
  getPlayerStats,
  getGoalieStats,
  queryForPlayerID,
  queryForPlayerByID,
};
