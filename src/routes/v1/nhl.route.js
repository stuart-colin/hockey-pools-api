const express = require('express');
const nhlController = require('../../controllers/nhl.controller');

const router = express.Router();

router.post('/queryForPlayerID', nhlController.queryForPlayerID);
router.post('/queryForPlayerByID', nhlController.queryForPlayerByID);
router.get('/stats/*', nhlController.getStats);
router.get('/web/*', nhlController.getWebApi);
router.get('/rest/*', nhlController.getRestApi);
router.get('/scores', nhlController.getScoresNow);
router.get('/scores/:date', nhlController.getScoresByDate);
router.get('/standings', nhlController.getStandingsNow);

module.exports = router;
