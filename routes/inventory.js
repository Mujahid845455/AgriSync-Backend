const express = require('express');
const router = express.Router();
const inventoryController = require('../controllers/inventoryController');

// GET all inventory records (calculated based on date query param)
router.get('/', inventoryController.getInventory);

// POST create a new agri input row
router.post('/', inventoryController.createInput);

// PUT update an agri input row metadata
router.put('/:id', inventoryController.updateInput);

// DELETE an agri input row (and its transactions)
router.delete('/:id', inventoryController.deleteInput);

// POST bulk save/upsert transaction quantities for a date
router.post('/save-transactions', inventoryController.saveTransactions);

module.exports = router;
