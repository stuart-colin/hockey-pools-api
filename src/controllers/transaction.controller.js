const httpStatus = require('http-status');
const catchAsync = require('../utils/catchAsync');
const { transactionService, playerService, draftpickService, teamService } = require('../services');

const getTransactionByID = catchAsync(async (req, res) => {
  const transaction = await transactionService.getTransactionByID(req.params.id);
  for (let i = 0; i < transaction.teamA.assets.length; i++) {
    const asset = transaction.teamA.assets[i];
    if (asset.type === 'player') {
      const player = await playerService.getPlayerById(asset.player);
      delete player.transactions;
      asset.player = player;
    }
    if (asset.type === 'pick') {
      const pick = await draftpickService.getDraftPickByID(asset.pick);
      delete pick.originTeam.transactions;
      asset.pick = pick;
    }
  }
  const teamA = await teamService.getTeamByID(transaction.teamA.team);
  transaction.teamA.team = teamA;

  for (let i = 0; i < transaction.teamB.assets.length; i++) {
    const asset = transaction.teamB.assets[i];
    if (asset.type === 'player') {
      const player = await playerService.getPlayerById(asset.player);
      delete player.transactions;
      asset.player = player;
    }
    if (asset.type === 'pick') {
      const pick = await draftpickService.getDraftPickByID(asset.pick);
      console.log(pick);
      delete pick.originTeam.transactions;
      asset.pick = pick;
    }
  }
  const teamB = await teamService.getTeamByID(transaction.teamB.team);
  transaction.teamB.team = teamB;
  res.status(httpStatus.CREATED).send(transaction);
});

const isTransactionExist = catchAsync(async (req, res) => {
  const transaction = await transactionService.isTransactionExist(req.body);
  res.status(httpStatus.OK).send(transaction);
});

module.exports = {
  getTransactionByID,
  isTransactionExist,
};
