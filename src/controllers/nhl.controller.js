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

module.exports = {
  queryForPlayerID,
  queryForPlayerByID,
};
