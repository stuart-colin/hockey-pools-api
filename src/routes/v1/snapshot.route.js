const express = require('express');
const snapshotController = require('../../controllers/snapshot.controller');

const router = express.Router();

router.get('/dates', snapshotController.listDates);
router.get('/timeseries', snapshotController.getTimeseries);
router.get('/standings/:date', snapshotController.getStandings);
router.post('/run', snapshotController.runSnapshot);

module.exports = router;
