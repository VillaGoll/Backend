const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller');
const auth = require('../middleware/auth.middleware');

// @route   POST api/auth/register
// @desc    Register a new user
// @access  Public (for now, will be admin only later)
router.post('/register', authController.register);

// @route   POST api/auth/login
// @desc    Authenticate user & get token
// @access  Public
router.post('/login', authController.login);

// @route   POST api/auth/re-auth
// @desc    Re-authenticate user
// @access  Private
router.post('/re-auth', auth, authController.reAuth);

module.exports = router;