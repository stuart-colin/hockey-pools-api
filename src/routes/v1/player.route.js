const express = require('express');
const playerController = require('../../controllers/player.controller');

const router = express.Router();

router.route('/').get(playerController.getPlayers).post(playerController.createPlayer);

router.route('/cache').get(playerController.cachePlayers);
router
  .route('/:playerId')
  .get(playerController.getPlayer)
  .delete(playerController.deletePlayer)
  .patch(playerController.updateOTL)
  .post(playerController.createPlayer);

router.route('/cache/:playerId').get(playerController.cachePlayer);

// router.route('/:playerName').get(playerController.getPlayerName);
// router.route('/nhlid/:nhlId').get(playerController.getPlayerNHLID);
// router.route('/id/:playerId').get(playerController.getPlayerID);
// router.route('/').post(playerController.createPlayer);
// router.route('/id').post(playerController.createPlayerByID);
// router.route('/nonNHLPlayer').post(playerController.createNonNHLPlayer);

// router.route('/:playerID/transaction/:transactionID').patch(playerController.addTransactionToPlayer);
// router
//   .route('/:playerID')
//   .get(auth('getUsers'), validate(userValidation.getUser), userController.getUser)
//   .patch(auth('manageUsers'), validate(userValidation.updateUser), userController.updateUser)
//   .delete(auth('manageUsers'), validate(userValidation.deleteUser), userController.deleteUser);

module.exports = router;
