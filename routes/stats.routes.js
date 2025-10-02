const express = require('express');
const router = express.Router();
const statsController = require('../controllers/stats.controller');
const auth = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

// @route   GET api/stats/clients
// @desc    Get client statistics based on period
// @access  Private (Admin)
router.get('/clients', [auth, isAdmin], statsController.getClientStats);

// @route   GET api/stats/financial
// @desc    Get financial statistics based on period
// @access  Private (Admin)
router.get('/financial', [auth, isAdmin], statsController.getFinancialStats);

// @route   GET api/stats/clients/export
// @desc    Export client data to Excel
// @access  Private (Admin)
router.get('/clients/export', [auth, isAdmin], statsController.exportClientsToExcel);

// @route   GET api/stats/financial/export
// @desc    Export financial data to Excel
// @access  Private (Admin)
router.get('/financial/export', [auth, isAdmin], statsController.exportFinancialToExcel);

module.exports = router;