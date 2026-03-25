const express = require('express');
const nhlController = require('../../controllers/nhl.controller');

const router = express.Router();

router.post('/queryForPlayerID', nhlController.queryForPlayerID);
router.post('/queryForPlayerByID', nhlController.queryForPlayerByID);

module.exports = router;
