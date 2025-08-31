const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { createLog } = require('./log.controller');

exports.register = async (req, res) => {
    const { name, email, password, role } = req.body;

    try {
        let user = await User.findOne({ email });

        if (user) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        user = new User({
            name,
            email,
            password,
            role,
        });

        await user.save();
        await createLog(user.name, 'User registered');

        const payload = {
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
            },
        };

        jwt.sign(
            payload,
            process.env.JWT_SECRET,
            { expiresIn: 3600 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.reAuth = async (req, res) => {
    const { password } = req.body;

    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(400).json({ msg: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        await createLog(user.name, 'Usuario re-autenticado');

        res.json({ msg: 'Re-authentication successful' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};

exports.login = async (req, res) => {
    const { email, password } = req.body;
    console.log(email, password);

    try {
        let user = await User.findOne({ email });

        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const payload = {
            user: {
                id: user.id,
                name: user.name,
                role: user.role,
            },
        };

        jwt.sign(
            payload, 
            process.env.JWT_SECRET,

            //Expira en 5 segundos para pruebas
            { expiresIn: 36000000 },
            (err, token) => {
                if (err) throw err;
                res.json({ token });
            }
        );
        await createLog(user.name, 'Usuario autenticado');
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server error');
    }
};
