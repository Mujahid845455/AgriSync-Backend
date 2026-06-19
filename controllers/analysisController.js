const AgriInput = require('../models/AgriInput');
const Transaction = require('../models/Transaction');
const { Parser } = require('json2csv');

// Helper to format Date to YYYY-MM-DD
const formatDateString = (date) => {
  return date.toISOString().split('T')[0];
};

// Enhanced analysis calculations
const calculateEnhancedMetrics = (input, transactions, selectedDate) => {
  const itemIdStr = input._id.toString();
  
  // Initialize transaction aggregates
  const txMap = {
    procured: { onDate: 0, toDate: 0 },
    distributedCash: { onDate: 0, toDate: 0 },
    distributedLoan: { onDate: 0, toDate: 0 },
    cashPayment: { onDate: 0, toDate: 0 },
    loanPayment: { onDate: 0, toDate: 0 }
  };

  // Process transactions
  transactions.forEach(tx => {
    if (tx.itemId.toString() !== itemIdStr) return;
    
    const type = tx.type;
    const isOnDate = tx.dateString === selectedDate;

    if (txMap[type]) {
      if (isOnDate) txMap[type].onDate += tx.quantity;
      txMap[type].toDate += tx.quantity;
    }
  });

  // Basic calculations
  const procured = txMap.procured;
  const distributedCash = txMap.distributedCash;
  const distributedLoan = txMap.distributedLoan;
  const cashPayment = txMap.cashPayment;
  const loanPayment = txMap.loanPayment;

  const balanceInFactory = procured.toDate - (distributedCash.toDate + distributedLoan.toDate);
  const totalPayment = cashPayment.toDate + loanPayment.toDate;
  const outstandingAmount = (procured.toDate * input.salePrice) - totalPayment;

  // Enhanced Analysis Metrics
  const totalDistributed = distributedCash.toDate + distributedLoan.toDate;
  const inventoryTurnover = totalDistributed > 0 ? (procured.toDate / totalDistributed) : 0;
  const paymentEfficiency = (procured.toDate * input.salePrice) > 0 ? ((totalPayment / (procured.toDate * input.salePrice)) * 100) : 0;
  
  // Estimated profit margin (assuming 20% cost margin)
  const estimatedCost = procured.toDate * (input.salePrice * 0.8);
  const profitMargin = (totalDistributed * input.salePrice) > 0 ? (((totalDistributed * input.salePrice - estimatedCost) / (totalDistributed * input.salePrice)) * 100) : 0;
  
  // Risk assessment
  let riskLevel = 'Low';
  if (outstandingAmount > ((procured.toDate * input.salePrice) * 0.3)) riskLevel = 'High';
  else if (outstandingAmount > ((procured.toDate * input.salePrice) * 0.1)) riskLevel = 'Medium';
  
  // Stock status
  let stockStatus = 'Normal';
  if (balanceInFactory < (procured.toDate * 0.1)) stockStatus = 'Low Stock';
  else if (balanceInFactory > (procured.toDate * 0.8)) stockStatus = 'Overstocked';

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
    'Balance In Factory': balanceInFactory,
    'Cash Payment (On Date)': cashPayment.onDate,
    'Cash Payment (To Date)': cashPayment.toDate,
    'Loan Payment (On Date)': loanPayment.onDate,
    'Loan Payment (To Date)': loanPayment.toDate,
    'Total Payment (To Date)': totalPayment,
    'Outstanding Amount (To Date)': outstandingAmount,
    // Enhanced metrics
    'Total Distributed': totalDistributed,
    'Inventory Turnover Ratio': Number(inventoryTurnover.toFixed(2)),
    'Payment Efficiency (%)': Number(paymentEfficiency.toFixed(1)),
    'Estimated Profit Margin (%)': Number(profitMargin.toFixed(1)),
    'Risk Level': riskLevel,
    'Stock Status': stockStatus
  };
};
// GET /api/analysis/enhanced?date=YYYY-MM-DD
exports.getEnhancedAnalysis = async (req, res) => {
  try {
    const selectedDate = req.query.date || formatDateString(new Date());

    const inputs = await AgriInput.find().sort({ createdAt: 1 }).lean();
    const transactions = await Transaction.find({
      dateString: { $lte: selectedDate }
    }).lean();

    const analysisData = inputs.map(input => 
      calculateEnhancedMetrics(input, transactions, selectedDate)
    );

    // Calculate summary metrics
    const summary = analysisData.reduce((acc, item) => {
      acc.totalBalance += item['Balance In Factory'];
      acc.totalRevenue += item['Expected Revenue (To Date)'];
      acc.totalPaid += item['Total Payment (To Date)'];
      acc.totalOutstanding += item['Outstanding Amount (To Date)'];
      acc.avgTurnover += item['Inventory Turnover Ratio'];
      acc.avgPaymentEff += item['Payment Efficiency (%)'];
      acc.avgProfitMargin += item['Estimated Profit Margin (%)'];
      
      // Risk analysis
      if (item['Risk Level'] === 'High') acc.highRiskCount++;
      else if (item['Risk Level'] === 'Medium') acc.mediumRiskCount++;
      
      // Stock analysis
      if (item['Stock Status'] === 'Low Stock') acc.lowStockCount++;
      else if (item['Stock Status'] === 'Overstocked') acc.overstockedCount++;
      
      return acc;
    }, {
      totalBalance: 0, totalRevenue: 0, totalPaid: 0, totalOutstanding: 0,
      avgTurnover: 0, avgPaymentEff: 0, avgProfitMargin: 0,
      highRiskCount: 0, mediumRiskCount: 0, lowStockCount: 0, overstockedCount: 0
    });

    // Calculate averages
    if (analysisData.length > 0) {
      summary.avgTurnover = Number((summary.avgTurnover / analysisData.length).toFixed(2));
      summary.avgPaymentEff = Number((summary.avgPaymentEff / analysisData.length).toFixed(1));
      summary.avgProfitMargin = Number((summary.avgProfitMargin / analysisData.length).toFixed(1));
    }

    res.json({
      date: selectedDate,
      items: analysisData,
      summary,
      totalItems: analysisData.length
    });
  } catch (error) {
    console.error('Error generating enhanced analysis:', error);
    res.status(500).json({ error: 'Failed to generate enhanced analysis' });
  }
};

// GET /api/analysis/export-enhanced?date=YYYY-MM-DD&format=csv|xlsx
exports.exportEnhancedAnalysis = async (req, res) => {
  try {
    const selectedDate = req.query.date || formatDateString(new Date());
    const format = req.query.format || 'csv';

    const inputs = await AgriInput.find().sort({ createdAt: 1 }).lean();
    const transactions = await Transaction.find({
      dateString: { $lte: selectedDate }
    }).lean();

    const analysisData = inputs.map(input => 
      calculateEnhancedMetrics(input, transactions, selectedDate)
    );

    if (format === 'csv') {
      const fields = [
        'Agri Input Name', 'UOM', 'Sale Price (INR)',
        'Procured (On Date)', 'Procured (To Date)',
        'Distributed Cash (On Date)', 'Distributed Cash (To Date)',
        'Distributed Loan (On Date)', 'Distributed Loan (To Date)',
        'Balance In Factory', 'Total Distributed',
        'Cash Payment (On Date)', 'Cash Payment (To Date)',
        'Loan Payment (On Date)', 'Loan Payment (To Date)',
        'Total Payment (To Date)', 'Outstanding Amount (To Date)',
        'Inventory Turnover Ratio', 'Payment Efficiency (%)', 'Estimated Profit Margin (%)',
        'Risk Level', 'Stock Status'
      ];

      const parser = new Parser({ fields });
      const csv = parser.parse(analysisData);

      res.header('Content-Type', 'text/csv');
      res.attachment(`AgriSync_Enhanced_Analysis_${selectedDate}.csv`);
      return res.send(csv);
    } else {
      // Return JSON for Excel generation on frontend
      res.json({
        data: analysisData,
        filename: `AgriSync_Enhanced_Analysis_${selectedDate}`,
        date: selectedDate
      });
    }
  } catch (error) {
    console.error('Error exporting enhanced analysis:', error);
    res.status(500).json({ error: 'Failed to export enhanced analysis' });
  }
};