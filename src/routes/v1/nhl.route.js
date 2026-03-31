const express = require('express');
const nhlController = require('../../controllers/nhl.controller');

const router = express.Router();

router.post('/queryForPlayerID', nhlController.queryForPlayerID);
router.post('/queryForPlayerByID', nhlController.queryForPlayerByID);
router.get('/teams', nhlController.getTeams);
router.get('/scores', nhlController.getScoresNow);
router.get('/scores/:date', nhlController.getScoresByDate);
router.get('/standings', nhlController.getStandingsNow);
router.get('/playerStats', nhlController.getPlayerStats);
router.get('/goalieStats', nhlController.getGoalieStats);

module.exports = router;
