const mongoose = require('mongoose');

const AgriInputSchema = new mongoose.Schema({
  inputName: {
    type: String,
    required: true,
    trim: true,
  },
  uom: {
    type: String,
    required: true,
    trim: true,
  },
  salePrice: {
    type: Number,
    required: true,
    min: 0,
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('AgriInput', AgriInputSchema);
