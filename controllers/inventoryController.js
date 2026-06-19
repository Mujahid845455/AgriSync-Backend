const AgriInput = require('../models/AgriInput');
const Transaction = require('../models/Transaction');

// GET /api/inventory?date=YYYY-MM-DD
exports.getInventory = async (req, res) => {
  try {
    const selectedDate = req.query.date || new Date().toISOString().split('T')[0];

    // Fetch all inputs
    const inputs = await AgriInput.find().sort({ createdAt: 1 }).lean();

    // Fetch all transactions up to the selected date
    const transactions = await Transaction.find({
      dateString: { $lte: selectedDate }
    }).lean();

    // Index transactions in memory for O(1) lookups
    const txMap = {};
    inputs.forEach(input => {
      txMap[input._id.toString()] = {
        procured: { onDate: 0, toDate: 0 },
        distributedCash: { onDate: 0, toDate: 0 },
        distributedLoan: { onDate: 0, toDate: 0 },
        cashPayment: { onDate: 0, toDate: 0 },
        loanPayment: { onDate: 0, toDate: 0 }
      };
    });

    transactions.forEach(tx => {
      const itemIdStr = tx.itemId.toString();
      if (!txMap[itemIdStr]) return;

      const type = tx.type;
      const isOnDate = tx.dateString === selectedDate;

      if (txMap[itemIdStr][type]) {
        if (isOnDate) {
          txMap[itemIdStr][type].onDate += tx.quantity;
        }
        txMap[itemIdStr][type].toDate += tx.quantity;
      }
    });

    // Compute metrics
    const results = inputs.map(input => {
      const idStr = input._id.toString();
      const tx = txMap[idStr];

      const procured = tx.procured;
      const distributedCash = tx.distributedCash;
      const distributedLoan = tx.distributedLoan;
      const cashPayment = tx.cashPayment;
      const loanPayment = tx.loanPayment;

      const balance = procured.toDate - (distributedCash.toDate + distributedLoan.toDate);
      const totalPayment = cashPayment.toDate + loanPayment.toDate;
      const outstandingAmount = (procured.toDate * input.salePrice) - totalPayment;

      return {
        _id: input._id,
        inputName: input.inputName,
        uom: input.uom,
        salePrice: input.salePrice,
        procured,
        distributedCash,
        distributedLoan,
        cashPayment,
        loanPayment,
        balance,
        totalPayment,
        outstandingAmount,
        createdAt: input.createdAt,
        updatedAt: input.updatedAt
      };
    });

    res.json(results);
  } catch (error) {
    console.error('Error fetching inventory:', error);
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
};

// POST /api/inventory (Add Row)
exports.createInput = async (req, res) => {
  try {
    const { inputName, uom, salePrice } = req.body;
    if (!inputName || !uom || salePrice === undefined) {
      return res.status(400).json({ error: 'inputName, uom, and salePrice are required' });
    }

    const newInput = new AgriInput({
      inputName,
      uom,
      salePrice: Number(salePrice)
    });

    await newInput.save();
    res.status(201).json(newInput);
  } catch (error) {
    console.error('Error creating input:', error);
    res.status(500).json({ error: 'Failed to create agricultural input' });
  }
};

// PUT /api/inventory/:id (Edit Row)
exports.updateInput = async (req, res) => {
  try {
    const { id } = req.params;
    const { inputName, uom, salePrice } = req.body;

    const updated = await AgriInput.findByIdAndUpdate(
      id,
      {
        inputName,
        uom,
        salePrice: salePrice !== undefined ? Number(salePrice) : undefined
      },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'AgriInput not found' });
    }

    res.json(updated);
  } catch (error) {
    console.error('Error updating input:', error);
    res.status(500).json({ error: 'Failed to update agricultural input' });
  }
};

// DELETE /api/inventory/:id (Delete Row)
exports.deleteInput = async (req, res) => {
  try {
    const { id } = req.params;

    const deleted = await AgriInput.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'AgriInput not found' });
    }

    // Cascade delete transactions
    await Transaction.deleteMany({ itemId: id });

    res.json({ message: 'AgriInput and associated transactions deleted successfully' });
  } catch (error) {
    console.error('Error deleting input:', error);
    res.status(500).json({ error: 'Failed to delete agricultural input' });
  }
};

// POST /api/inventory/save-transactions (Bulk Save OnDate Values)
exports.saveTransactions = async (req, res) => {
  try {
    const { date, updates } = req.body;

    if (!date || !Array.isArray(updates)) {
      return res.status(400).json({ error: 'date and updates array are required' });
    }

    const bulkOps = [];
    const targetDate = new Date(date);

    for (const update of updates) {
      const { itemId, procured, distributedCash, distributedLoan, cashPayment, loanPayment } = update;
      const types = { procured, distributedCash, distributedLoan, cashPayment, loanPayment };

      for (const [type, quantity] of Object.entries(types)) {
        if (quantity === undefined || quantity === null || quantity === '') continue;

        const qtyNum = Number(quantity);

        if (qtyNum > 0) {
          bulkOps.push({
            updateOne: {
              filter: { itemId, type, dateString: date },
              update: {
                $set: {
                  quantity: qtyNum,
                  date: targetDate
                }
              },
              upsert: true
            }
          });
        } else {
          // If quantity is 0 or less, delete the transaction to clean up DB
          bulkOps.push({
            deleteOne: {
              filter: { itemId, type, dateString: date }
            }
          });
        }
      }
    }

    if (bulkOps.length > 0) {
      await Transaction.bulkWrite(bulkOps);
    }

    res.json({ message: 'Transactions saved successfully' });
  } catch (error) {
    console.error('Error saving transactions:', error);
    res.status(500).json({ error: 'Failed to save transactions' });
  }
};
