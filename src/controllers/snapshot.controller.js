const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { snapshotService } = require('../services');

const requireSeason = (req) => {
  const season = req.query.season || req.body?.season;
  if (!season) {
    throw new ApiError(httpStatus.BAD_REQUEST, 'season query parameter is required');
  }
  return String(season);
};

const listDates = catchAsync(async (req, res) => {
  const season = requireSeason(req);
  const dates = await snapshotService.listAvailableDates({ season });
  res.send({ season, dates });
});

const getStandings = catchAsync(async (req, res) => {
  const season = requireSeason(req);
  const date = req.params.date;
  const standings = await snapshotService.getStandingsAtDate({ season, date });
  res.send({ season, date, standings });
});

const getTimeseries = catchAsync(async (req, res) => {
  const season = requireSeason(req);
  const { from, to } = req.query;
  const result = await snapshotService.getTimeseries({ season, from, to });
  res.send(result);
});

const runSnapshot = catchAsync(async (req, res) => {
  const season = req.body?.season || req.query.season;
  const date = req.body?.date || req.query.date;
  const result = await snapshotService.runDailySnapshot({ season, date });
  res.send(result);
});

module.exports = {
  listDates,
  getStandings,
  getTimeseries,
  runSnapshot,
};
