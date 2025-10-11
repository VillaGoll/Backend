const mongoose = require('mongoose');

const ClientSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
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

// Create unique indexes for name and phone
ClientSchema.index({ name: 1 }, { unique: true });
ClientSchema.index({ phone: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Client', ClientSchema);