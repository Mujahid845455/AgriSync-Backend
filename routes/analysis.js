const express = require('express');
const router = express.Router();
const analysisController = require('../controllers/analysisController');

// GET /api/analysis/enhanced - Get enhanced analysis with new metrics
router.get('/enhanced', analysisController.getEnhancedAnalysis);

// GET /api/analysis/export-enhanced - Export enhanced analysis 
router.get('/export-enhanced', analysisController.exportEnhancedAnalysis);

module.exports = router;