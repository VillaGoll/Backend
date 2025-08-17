const express = require('express');
const router = express.Router();
const courtController = require('../controllers/court.controller');
const auth = require('../middleware/auth.middleware');

// @route   POST api/courts
// @desc    Create a new court
// @access  Private (Admin)
router.post('/', auth, courtController.createCourt);

// @route   GET api/courts
// @desc    Get all courts
// @access  Private
router.get('/', auth, courtController.getCourts);

// @route   GET api/courts/originals
// @desc    Get all original courts
// @access  Private (Admin)
router.get('/originals', auth, courtController.getOriginalCourts);

// @route   PUT api/courts/:id
// @desc    Update a court
// @access  Private (Admin)
router.put('/:id', auth, courtController.updateCourt);

// @route   DELETE api/courts/:id
// @desc    Delete a court
// @access  Private (Admin)
router.delete('/:id', auth, courtController.deleteCourt);

module.exports = router;