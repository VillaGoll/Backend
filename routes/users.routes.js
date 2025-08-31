const express = require('express');
const router = express.Router();
const { createUser, getUsers, updateUser, deleteUser, getUserEmails } = require('../controllers/user.controller');
const auth = require('../middleware/auth.middleware');
const { isAdmin } = require('../middleware/admin.middleware');

router.post('/', [auth, isAdmin], createUser);
router.get('/', [auth, isAdmin], getUsers);
router.get('/emails', getUserEmails);
router.put('/:id', [auth, isAdmin], updateUser); 
router.delete('/:id', [auth, isAdmin], deleteUser);

module.exports = router;