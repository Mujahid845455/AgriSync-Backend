const mongoose = require('mongoose');

const TransactionSchema = new mongoose.Schema({
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AgriInput',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['procured', 'distributedCash', 'distributedLoan', 'cashPayment', 'loanPayment'],
    required: true,
  },
  quantity: {
    type: Number,
    required: true,
    default: 0,
  },
  date: {
    type: Date,
    required: true,
    index: true,
  },
  dateString: {
    type: String,
    required: true,
    index: true, // Stores format YYYY-MM-DD to prevent timezone-related errors
  }
}, {
  timestamps: true
});

// Compound index to ensure uniqueness of (itemId, type, dateString)
TransactionSchema.index({ itemId: 1, type: 1, dateString: 1 }, { unique: true });

module.exports = mongoose.model('Transaction', TransactionSchema);
