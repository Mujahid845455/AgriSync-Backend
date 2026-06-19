const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

// GET weekly report
router.get('/weekly', reportController.getWeeklyReport);

// GET monthly report
router.get('/monthly', reportController.getMonthlyReport);

// GET yearly report
router.get('/yearly', reportController.getYearlyReport);

// GET export inventory data to CSV format
router.get('/export', reportController.exportInventoryCSV);

module.exports = router;
