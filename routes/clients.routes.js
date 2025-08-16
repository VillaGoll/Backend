const express = require('express');
const router = express.Router();
const { createClient, getClients, updateClient, deleteClient, getClientStats, getClientBookings } = require('../controllers/client.controller');
const auth = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

router.post('/', [auth, isAdmin], createClient);
router.get('/', auth, getClients); // Remove admin restriction for reading clients
router.get('/:id/stats', auth, getClientStats);
router.get('/:id/bookings', auth, getClientBookings);
router.put('/:id', [auth, isAdmin], updateClient);
router.delete('/:id', [auth, isAdmin], deleteClient);

module.exports = router;