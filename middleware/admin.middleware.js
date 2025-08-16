const jwt = require('jsonwebtoken');
const User = require('../models/User');

exports.isAdmin = async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id);
        if (user.role !== 'admin') {
            return res.status(403).json({ message: 'Access denied. Admins only.' });
        }
        next();
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};