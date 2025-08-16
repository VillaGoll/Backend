const User = require('../models/User');
const bcrypt = require('bcryptjs');

const createAdminUser = async () => {
    try {
        const existingAdmin = await User.findOne({ email: 'admin@example.com' });

        if (!existingAdmin) {
            const adminUser = new User({
                name: 'Admin',
                email: 'admin@example.com',
                password: 'adminpassword',
                role: 'admin',
            });
            await adminUser.save();
            console.log('Admin user created');
        }
    } catch (error) {
        console.error('Error creating admin user:', error);
    }
};

module.exports = createAdminUser;