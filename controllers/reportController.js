const AgriInput = require('../models/AgriInput');
const Transaction = require('../models/Transaction');
const { Parser } = require('json2csv');

// Helper to format Date to YYYY-MM-DD
const formatDateString = (date) => {
  return date.toISOString().split('T')[0];
};

// Date range calculators
const getWeekRange = (d) => {
  const date = new Date(d);
  const day = date.getDay(); // 0: Sun, 1: Mon, etc.
  const diff = date.getDate() - day; // Back to Sunday
  
  const start = new Date(date.setDate(diff));
  start.setHours(0, 0, 0, 0);
  
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  
  return { start, end };
};

const getMonthRange = (d) => {
  const date = new Date(d);
  const start = new Date(date.getFullYear(), date.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
};

const getYearRange = (d) => {
  const date = new Date(d);
  const start = new Date(date.getFullYear(), 0, 1, 0, 0, 0, 0);
  const end = new Date(date.getFullYear(), 11, 31, 23, 59, 59, 999);
  return { start, end };
};

// Helper: Generates a reconciliation report within a date range
const generateReconciliationData = async (start, end) => {
  const startStr = formatDateString(start);
  const endStr = formatDateString(end);

  const inputs = await AgriInput.find().sort({ createdAt: 1 }).lean();
  const transactions = await Transaction.find({ dateString: { $lte: endStr } }).lean();

  const results = inputs.map(input => {
    const itemIdStr = input._id.toString();

    // Stats variables
    let beforeProcured = 0, beforeDistCash = 0, beforeDistLoan = 0, beforeCashPay = 0, beforeLoanPay = 0;
    let periodProcured = 0, periodDistCash = 0, periodDistLoan = 0, periodCashPay = 0, periodLoanPay = 0;

    transactions.forEach(tx => {
      if (tx.itemId.toString() !== itemIdStr) return;

      const txDate = tx.dateString;
      const quantity = tx.quantity;

      if (txDate < startStr) {
        // Transactions before period
        if (tx.type === 'procured') beforeProcured += quantity;
        else if (tx.type === 'distributedCash') beforeDistCash += quantity;
        else if (tx.type === 'distributedLoan') beforeDistLoan += quantity;
        else if (tx.type === 'cashPayment') beforeCashPay += quantity;
        else if (tx.type === 'loanPayment') beforeLoanPay += quantity;
      } else if (txDate <= endStr) {
        // Transactions during period
        if (tx.type === 'procured') periodProcured += quantity;
        else if (tx.type === 'distributedCash') periodDistCash += quantity;
        else if (tx.type === 'distributedLoan') periodDistLoan += quantity;
        else if (tx.type === 'cashPayment') periodCashPay += quantity;
        else if (tx.type === 'loanPayment') periodLoanPay += quantity;
      }
    });

    const openingBalance = beforeProcured - beforeDistCash - beforeDistLoan;
    const closingBalance = (beforeProcured + periodProcured) - (beforeDistCash + periodDistCash) - (beforeDistLoan + periodDistLoan);

    const openingExpectedRevenue = (beforeDistCash + beforeDistLoan) * input.salePrice;
    const openingTotalPayment = beforeCashPay + beforeLoanPay;
    const openingOutstanding = openingExpectedRevenue - openingTotalPayment;

    const periodExpectedRevenue = (periodDistCash + periodDistLoan) * input.salePrice;
    const periodTotalPayment = periodCashPay + periodLoanPay;

    const closingExpectedRevenue = (beforeDistCash + periodDistCash + beforeDistLoan + periodDistLoan) * input.salePrice;
    const closingTotalPayment = beforeCashPay + periodCashPay + beforeLoanPay + periodLoanPay;
    const closingOutstanding = closingExpectedRevenue - closingTotalPayment;

    return {
      _id: input._id,
      inputName: input.inputName,
      uom: input.uom,
      salePrice: input.salePrice,
      openingBalance,
      periodProcured,
      periodDistCash,
      periodDistLoan,
      closingBalance,
      periodExpectedRevenue,
      periodTotalPayment,
      openingOutstanding,
      periodCashPay,
      periodLoanPay,
      closingOutstanding
    };
  });

  // Calculate summary cards
  let totalOpeningBalance = 0;
  let totalPeriodProcured = 0;
  let totalPeriodDistCash = 0;
  let totalPeriodDistLoan = 0;
  let totalClosingBalance = 0;
  let totalPeriodExpectedRevenue = 0;
  let totalPeriodTotalPayment = 0;
  let totalClosingOutstanding = 0;

  results.forEach(r => {
    totalOpeningBalance += r.openingBalance;
    totalPeriodProcured += r.periodProcured;
    totalPeriodDistCash += r.periodDistCash;
    totalPeriodDistLoan += r.periodDistLoan;
    totalClosingBalance += r.closingBalance;
    totalPeriodExpectedRevenue += r.periodExpectedRevenue;
    totalPeriodTotalPayment += r.periodTotalPayment;
    totalClosingOutstanding += r.closingOutstanding;
  });

  return {
    range: { start: startStr, end: endStr },
    items: results,
    summary: {
      totalOpeningBalance,
      totalPeriodProcured,
      totalPeriodDistCash,
      totalPeriodDistLoan,
      totalClosingBalance,
      totalPeriodExpectedRevenue,
      totalPeriodTotalPayment,
      totalClosingOutstanding
    }
  };
};

// GET /api/reports/weekly?date=YYYY-MM-DD
exports.getWeeklyReport = async (req, res) => {
  try {
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    const { start, end } = getWeekRange(baseDate);
    const report = await generateReconciliationData(start, end);
    res.json(report);
  } catch (error) {
    console.error('Error generating weekly report:', error);
    res.status(500).json({ error: 'Failed to generate weekly report' });
  }
};

// GET /api/reports/monthly?date=YYYY-MM-DD
exports.getMonthlyReport = async (req, res) => {
  try {
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    const { start, end } = getMonthRange(baseDate);
    const report = await generateReconciliationData(start, end);
    res.json(report);
  } catch (error) {
    console.error('Error generating monthly report:', error);
    res.status(500).json({ error: 'Failed to generate monthly report' });
  }
};

// GET /api/reports/yearly?date=YYYY-MM-DD
exports.getYearlyReport = async (req, res) => {
  try {
    const baseDate = req.query.date ? new Date(req.query.date) : new Date();
    const { start, end } = getYearRange(baseDate);
    const report = await generateReconciliationData(start, end);
    res.json(report);
  } catch (error) {
    console.error('Error generating yearly report:', error);
    res.status(500).json({ error: 'Failed to generate yearly report' });
  }
};

// GET /api/inventory/export?date=YYYY-MM-DD
exports.exportInventoryCSV = async (req, res) => {
  try {
    const selectedDate = req.query.date || formatDateString(new Date());

    const inputs = await AgriInput.find().sort({ createdAt: 1 }).lean();
    const transactions = await Transaction.find({
      dateString: { $lte: selectedDate }
    }).lean();

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
        if (isOnDate) txMap[itemIdStr][type].onDate += tx.quantity;
        txMap[itemIdStr][type].toDate += tx.quantity;
      }
    });

    const data = inputs.map(input => {
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
        'Agri Input Name': input.inputName,
        'UOM': input.uom,
        'Sale Price (INR)': input.salePrice,
        'Procured (On Date)': procured.onDate,
        'Procured (To Date)': procured.toDate,
        'Distributed Cash (On Date)': distributedCash.onDate,
        'Distributed Cash (To Date)': distributedCash.toDate,
        'Distributed Loan (On Date)': distributedLoan.onDate,
        'Distributed Loan (To Date)': distributedLoan.toDate,
        'Balance In Factory': balance,
        'Cash Payment (On Date)': cashPayment.onDate,
        'Cash Payment (To Date)': cashPayment.toDate,
        'Loan Payment (On Date)': loanPayment.onDate,
        'Loan Payment (To Date)': loanPayment.toDate,
        'Total Payment (To Date)': totalPayment,
        'Outstanding Amount (To Date)': outstandingAmount
      };
    });

    const fields = [
      'Agri Input Name', 'UOM', 'Sale Price (INR)',
      'Procured (On Date)', 'Procured (To Date)',
      'Distributed Cash (On Date)', 'Distributed Cash (To Date)',
      'Distributed Loan (On Date)', 'Distributed Loan (To Date)',
      'Balance In Factory',
      'Cash Payment (On Date)', 'Cash Payment (To Date)',
      'Loan Payment (On Date)', 'Loan Payment (To Date)',
      'Total Payment (To Date)', 'Outstanding Amount (To Date)'
    ];

    const parser = new Parser({ fields });
    const csv = parser.parse(data);

    res.header('Content-Type', 'text/csv');
    res.attachment(`Agri_Inventory_Reconciliation_${selectedDate}.csv`);
    return res.send(csv);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    res.status(500).json({ error: 'Failed to export CSV file' });
  }
};
