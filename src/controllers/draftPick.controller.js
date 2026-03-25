const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { draftpickService } = require('../services');

const createDraftPick = catchAsync(async (req, res) => {
  const draftPick = await draftpickService.createDraftPick(req.body);
  res.status(httpStatus.CREATED).send(draftPick);
});

const getDraftPick = catchAsync(async (req, res) => {
  const draftPick = await draftpickService.getDraftPickByID(req.params.draftpickId);
  if (!draftPick) {
    throw new ApiError(httpStatus.NOT_FOUND, 'Player not found');
  }
  res.send(draftPick);
});

module.exports = {
  createDraftPick,
  getDraftPick,
};
