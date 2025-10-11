const Booking = require('../models/Booking');
const Client = require('../models/Client');
const Court = require('../models/Court');
const { createLog } = require('./log.controller');

// Crear una nueva reserva
exports.createBooking = async (req, res) => {
    const { court, date, timeSlot, clientName, deposit, status, client } = req.body;

    try {
        // Validar que la fecha y hora de la reserva no sean en el pasado
        const bookingDateTime = new Date(`${date}T${timeSlot}:00-06:00`);
        const now = new Date();
        
        // Extraer solo la fecha (sin hora) para comparar días
        const bookingDate = new Date(bookingDateTime);
        bookingDate.setHours(0, 0, 0, 0);
        
        const today = new Date(now);
        today.setHours(0, 0, 0, 0);
        
        // Extraer la hora de la reserva y la hora actual
        const bookingHour = bookingDateTime.getHours();
        const currentHour = now.getHours();
        
        // Verificar si el usuario es administrador
        if (req.user.role !== 'admin') {
            // Para usuarios regulares, aplicar todas las restricciones
            
            // Caso 1: Si la fecha de reserva es anterior a hoy, rechazar
            if (bookingDate < today) {
                return res.status(400).json({ msg: 'No se puede crear una reserva en una fecha pasada. Solo administradores pueden realizar esta acción.' });
            }
            
            // Caso 2: Si es el mismo día pero la hora de reserva ya pasó completamente
            if (bookingDate.getTime() === today.getTime() && bookingHour < currentHour) {
                return res.status(400).json({ msg: 'No se puede crear una reserva en un horario que ya ha pasado. Solo administradores pueden realizar esta acción.' });
            }
        }
        // Si es administrador, permitir continuar con la creación de la reserva sin importar la fecha/hora
        
        // Si viene un clientId, lo usamos, sino buscamos por nombre
        let clientId = client;
        
        if (!clientId && clientName) {
            const existingClient = await Client.findOne({ name: clientName.trim() });
            if (existingClient) {
                clientId = existingClient._id;
            }
        }

        // Crear la fecha completa para el campo date (fecha + hora en GMT-6)
        const fullBookingDate = new Date(`${date}T${timeSlot}:00-06:00`);

        const newBooking = new Booking({
            user: req.user.id,
            court,
            date: fullBookingDate, // Guardamos como Date con timezone GMT-6
            timeSlot,
            client: clientId,
            clientName,
            deposit,
            status,
        });

        const booking = await newBooking.save();

        // Si hay un cliente asociado, agregar la reserva a su lista
        if (clientId) {
            await Client.findByIdAndUpdate(
                clientId,
                { $addToSet: { bookings: booking._id } },
                { new: true }
            );
        }

        await createLog(req.user.name, `Creo la reserva para ${clientName} en ${date} a las ${timeSlot}`);

        res.json(booking);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al crear la reserva', error: err.message });
    }
};

// Obtener todas las reservas para una cancha y semana específicas
exports.getBookings = async (req, res) => {
    const { courtId } = req.params;

    try {
        const bookings = await Booking.find({ court: courtId }).populate('user', ['name', 'email']);
        //await createLog(req.user.name, `Viewed bookings for court ${courtId}`);
        res.json(bookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al obtener las reservas', error: err.message });
    }
};

// Obtener reservas para una cancha en un rango de fechas específico
exports.getBookingsByDateRange = async (req, res) => {
    const { courtId } = req.params;
    const { startDate, endDate } = req.query;

    //Buscar nombre de la cancha por id
    const court = await Court.findById(courtId);
    //const courtName = court.name;
    try {
        const start = new Date(`${startDate}T00:00:00-06:00`);
        const end = new Date(`${endDate}T23:59:59-06:00`);
        
        const bookings = await Booking.find({ 
            court: courtId,
            date: { $gte: start, $lte: end }
        }).populate('user', ['name', 'email']);
        
        //await createLog(req.user.name, `Vio las reservas para la cancha ${courtName} entre ${startDate} y ${endDate}`);
        res.json(bookings);
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al obtener las reservas por rango de fecha', error: err.message });
    }
};

// Actualizar una reserva
exports.updateBooking = async (req, res) => {
    const { clientName, deposit, status, client } = req.body;

    try {
        let booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ msg: 'Reserva no encontrada' });

        // Mantener referencia anterior de cliente para sincronizar arrays
        const previousClientId = booking.client ? booking.client.toString() : undefined;

        // Resolver nuevo cliente (por id o por nombre)
        let clientId = client; // puede ser undefined/null/string
        if (!clientId && clientName) {
            const existingClient = await Client.findOne({ name: clientName.trim() });
            if (existingClient) {
                clientId = existingClient._id.toString();
            }
        }

        booking.clientName = clientName || booking.clientName;
        if (deposit !== undefined) booking.deposit = deposit;
        if (status) booking.status = status;

        // Establecer la nueva referencia (o quitarla si no hay cliente)
        const newClientId = clientId ? clientId.toString() : undefined;
        booking.client = newClientId || undefined;

        await booking.save();

        // Sincronizar las listas de bookings de los clientes si cambió
        if (previousClientId !== newClientId) {
            if (previousClientId) {
                await Client.findByIdAndUpdate(previousClientId, { $pull: { bookings: booking._id } });
            }
            if (newClientId) {
                await Client.findByIdAndUpdate(newClientId, { $addToSet: { bookings: booking._id } });
            }
        }

        await createLog(req.user.name, `Actualizo la reserva ${booking._id}`);
        res.json(booking);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Eliminar una reserva (solo para administradores)
exports.deleteBooking = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado' });
    }

    try {
        let booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ msg: 'Reserva no encontrada' });

        // Si la reserva tenía cliente asociado, quitar la referencia
        if (booking.client) {
            await Client.findByIdAndUpdate(booking.client, { $pull: { bookings: booking._id } });
        }

        await Booking.findByIdAndDelete(req.params.id);
        await createLog(req.user.name, `Elimino la reserva ${req.params.id}`);
        res.json({ msg: 'Reserva eliminada' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Hacer una reserva permanente (solo para administradores)
exports.makePermanentBooking = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado' });
    }

    try {
        const booking = await Booking.findById(req.params.id);
        if (!booking) {
            return res.status(404).json({ msg: 'Reserva no encontrada' });
        }

        const { isPermanent } = req.body;
        
        if (isPermanent) {
            // Hacer la reserva permanente por 12 meses
            const endDate = new Date();
            endDate.setFullYear(endDate.getFullYear() + 1);
            
            booking.isPermanent = true;
            booking.permanentEndDate = endDate;
            
            // Crear reservas para las próximas 52 semanas
            const bookingsToCreate = [];
            const startDate = new Date(booking.date);
            
            for (let week = 1; week <= 52; week++) {
                const newDate = new Date(startDate);
                newDate.setDate(startDate.getDate() + (week * 7));
                
                // Verificar si ya existe una reserva en esa fecha y hora exacta
                const existingBooking = await Booking.findOne({
                    court: booking.court,
                    date: newDate,
                    timeSlot: booking.timeSlot
                });
                
                // Verificar si ya existe una reserva permanente del mismo cliente en el mismo día de la semana
                const dayStart = new Date(newDate);
                dayStart.setHours(0, 0, 0, 0);
                const dayEnd = new Date(newDate);
                dayEnd.setHours(23, 59, 59, 999);
                
                const existingPermanentBooking = await Booking.findOne({
                    court: booking.court,
                    date: { $gte: dayStart, $lte: dayEnd },
                    clientName: booking.clientName,
                    isPermanent: true
                });
                
                if (!existingBooking ) {
                    bookingsToCreate.push({
                        user: booking.user,
                        court: booking.court,
                        date: newDate,
                        timeSlot: booking.timeSlot,
                        client: booking.client,
                        clientName: booking.clientName,
                        deposit: booking.deposit,
                        status: 'No llegó',
                        isPermanent: true,
                        permanentEndDate: endDate
                    });
                }
            }
            
            if (bookingsToCreate.length > 0) {
                const createdBookings = await Booking.insertMany(bookingsToCreate);
                
                if (booking.client) {
                    const newBookingIds = createdBookings.map(b => b._id);
                    await Client.findByIdAndUpdate(booking.client, { 
                        $addToSet: { bookings: { $each: newBookingIds } } 
                    }); 
                }
            }
            await booking.save();
            await createLog(req.user.name, `Hizo la reserva ${booking._id} permanente`);
            return res.json({ msg: 'Reserva hecha permanente', booking });
        } else {
            // Quitar permanencia
            const clickedBookingDate = new Date(booking.date);
            clickedBookingDate.setHours(0, 0, 0, 0);

            const allRelatedBookings = await Booking.find({
                court: booking.court,
                timeSlot: booking.timeSlot,
                clientName: booking.clientName,
                isPermanent: true
            });

            const bookingsToUpdateIds = [];
            const bookingsToDeleteIds = [];

            for (const b of allRelatedBookings) {
                const aDate = new Date(b.date);
                aDate.setHours(0, 0, 0, 0);

                if (aDate <= clickedBookingDate) {
                    bookingsToUpdateIds.push(b._id);
                } else {
                    bookingsToDeleteIds.push(b._id);
                }
            }

            if (bookingsToUpdateIds.length > 0) {
                await Booking.updateMany(
                    { _id: { $in: bookingsToUpdateIds } },
                    { $set: { isPermanent: false, permanentEndDate: null } }
                );
            }

            if (bookingsToDeleteIds.length > 0) {
                if (booking.client) {
                    await Client.findByIdAndUpdate(booking.client, { 
                        $pull: { bookings: { $in: bookingsToDeleteIds } } 
                    });
                }
                await Booking.deleteMany({ _id: { $in: bookingsToDeleteIds } });
            }
            
            await createLog(req.user.name, `Quitó la permanencia de la reserva ${booking._id}`);
            res.json({ msg: 'Permanencia quitada' });
        }
    } catch (err) {
        console.error(err);
        res.status(500).json({ msg: 'Error al gestionar la permanencia de la reserva', error: err.message });
    }
};
