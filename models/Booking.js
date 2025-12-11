const mongoose = require('mongoose');

const BookingSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    court: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Court',
        required: true,
    },
    date: {
        type: Date, // Cambio de String a Date para manejar timezones correctamente
        required: true,
    },
    timeSlot: {
        type: String, // e.g., '09:00-10:00' o '22:00'
        required: true,
    },
    client: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Client',
        required: false,
    },
    clientName: {
        type: String,
        required: true,
    },
    depositNote: {
        type: String,
        trim: true,
        default: '',
    },
    status: {
        type: String,
        enum: ['Llegó', 'No llegó'],
    },
    isPermanent: {
        type: Boolean,
        default: false,
    },
    permanentEndDate: {
        type: Date,
        required: false,
    },
}, { 
    timestamps: true, // esto agrega createdAt y updatedAt automáticamente
    toJSON: { 
        transform: function(doc, ret) {
            const offsetMinutes = -6 * 60; // GMT-6 en minutos

            // createdAt / updatedAt en GMT-6
            if (ret.createdAt) {
                const created = new Date(ret.createdAt);
                ret.createdAt = new Date(created.getTime() + offsetMinutes * 60000);
            }
            if (ret.updatedAt) {
                const updated = new Date(ret.updatedAt);
                ret.updatedAt = new Date(updated.getTime() + offsetMinutes * 60000);
            }

            // Normalizar fecha de la reserva para legacy (cuando date fue String en la DB)
            // Si viene como string 'YYYY-MM-DD', la convertimos combinándola con la hora del timeSlot en GMT-6
            if (ret && typeof ret.date === 'string') {
                const dateStr = ret.date; // 'YYYY-MM-DD'
                let hhmm = '12:00';
                if (typeof ret.timeSlot === 'string' && ret.timeSlot.length >= 5) {
                    // soportar formatos 'HH:mm' o 'HH:mm-..'
                    hhmm = ret.timeSlot.slice(0,5);
                }
                const composed = `${dateStr}T${hhmm}:00-06:00`;
                ret.date = new Date(composed);
            }

            return ret;
        }
    }
});

module.exports = mongoose.model('Booking', BookingSchema);
