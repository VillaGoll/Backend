const express = require('express');
const router = express.Router();
const { getLogs } = require('../controllers/log.controller');
const auth = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');


router.get('/', [auth, isAdmin], getLogs);

module.exports = router;