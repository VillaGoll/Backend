const mongoose = require('mongoose');

const CourtSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
    },
    color: {
        type: String,
        required: true,
    },
    isOriginal: {
        type: Boolean,
        default: false,
    },
    pricing: {
        sixAM: {
            type: Number,
            default: 0,
            min: 0,
        },
        sevenToFifteen: {
            type: Number,
            default: 0,
            min: 0,
        },
        sixteenToTwentyOne: {
            type: Number,
            default: 0,
            min: 0,
        },
        twentyTwo: {
            type: Number,
            default: 0,
            min: 0,
        },
        twentyThree: {
            type: Number,
            default: 0,
            min: 0,
        },
    },
});

module.exports = mongoose.model('Court', CourtSchema);