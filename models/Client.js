const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    email: {
        type: String,
        required: false,
        unique: true,
        sparse: true,
        trim: true,
    },
    phone: {
        type: String,
        required: false,
        trim: true,
    },
    bookings: {
        type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Booking' }],
        default: [],
    },
});

module.exports = mongoose.model('Client', ClientSchema);