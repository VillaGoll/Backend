const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller');
const auth = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

// @route   POST api/bookings
// @desc    Create a new booking
// @access  Private
router.post('/', auth, bookingController.createBooking);

// @route   GET api/bookings
// @desc    Get all bookings for a specific court and week
// @access  Private
router.get('/court/:courtId', auth, bookingController.getBookings);

// @route   GET api/bookings/court/:courtId/range
// @desc    Get bookings for a specific court and date range
// @access  Private
router.get('/court/:courtId/range', auth, bookingController.getBookingsByDateRange);

// @route   PUT api/bookings/:id
// @desc    Update a booking
// @access  Private
router.put('/:id', auth, bookingController.updateBooking);

// @route   DELETE api/bookings/:id
// @desc    Delete a booking
// @access  Private (Admin)
router.delete('/:id', [auth, isAdmin], bookingController.deleteBooking);

// @route   PUT api/bookings/:id/permanent
// @desc    Make a booking permanent or remove permanence
// @access  Private (Admin)
router.put('/:id/permanent', [auth, isAdmin], bookingController.makePermanentBooking);

module.exports = router;