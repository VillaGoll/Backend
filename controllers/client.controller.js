const Client = require('../models/Client');
const Booking = require('../models/Booking');
const { createLog } = require('./log.controller');

// @desc    Create a new client
// @route   POST /api/clients
// @access  Private/Admin
exports.createClient = async (req, res) => {
    const { name, phone } = req.body;

    try {
        // Check for duplicates before attempting to create
        const existingClient = await Client.findOne({
            $or: [
                { name: name },
                { phone: phone }
            ]
        });
        
        if (existingClient) {
            let message = 'Error de duplicado: ';
            const existingByName = await Client.findOne({ name: name });
            const existingByPhone = await Client.findOne({ phone: phone });
            
            if (existingByName) {
                message += 'el nombre ya existe. ';
            }
            if (existingByPhone) {
                message += 'el teléfono ya existe. ';
            }
            return res.status(409).json({ message });
        }

        const client = new Client({ name, phone });
        await client.save();
        await createLog(req.user.name, `Creo al cliente: ${client.name}`);
        res.status(201).json(client);
    } catch (error) {
        if (error.code === 11000) {
            let message = 'Error de duplicado: ';
            if (error.keyPattern.name) {
                message += 'el nombre ya existe. ';
            }
            if (error.keyPattern.phone) {
                message += 'el teléfono ya existe. ';
            }
            return res.status(409).json({ message });
        }
        console.error('Error creating client:', error);
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get all clients
// @route   GET /api/clients
// @access  Private/Admin
exports.getClients = async (req, res) => {
    try {
        const clients = await Client.find();
        //await createLog(req.user.name, 'Viewed clients');
        res.json(clients);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Update a client
// @route   PUT /api/clients/:id
// @access  Private/Admin
exports.updateClient = async (req, res) => {
    const { name, phone } = req.body;
    const clientId = req.params.id;

    try {
        let client = await Client.findById(clientId);

        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Check for duplicates, but exclude current client
        const existingClient = await Client.findOne({
            $or: [
                { name: name },
                { phone: phone }
            ],
            _id: { $ne: clientId } // Exclude current client from check
        });
        
        if (existingClient) {
            let message = 'Error de duplicado: ';
            const existingByName = await Client.findOne({ name: name, _id: { $ne: clientId } });
            const existingByPhone = await Client.findOne({ phone: phone, _id: { $ne: clientId } });
            
            if (existingByName) {
                message += 'el nombre ya existe. ';
            }
            if (existingByPhone) {
                message += 'el teléfono ya existe. ';
            }
            return res.status(409).json({ message });
        }

        client.name = name;
        client.phone = phone;

        await client.save();
        await createLog(req.user.name, `Actualizo al cliente: ${client.name}`);

        res.json(client);
    } catch (error) {
        if (error.code === 11000) {
            let message = 'Error de duplicado: ';
            if (error.keyPattern.name) {
                message += 'el nombre ya existe. ';
            }
            if (error.keyPattern.phone) {
                message += 'el teléfono ya existe. ';
            }
            return res.status(409).json({ message });
        }
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Delete a client
// @route   DELETE /api/clients/:id
// @access  Private/Admin
exports.deleteClient = async (req, res) => {
    try {
        const client = await Client.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        await Client.deleteOne({ _id: req.params.id });
        await createLog(req.user.name, `Elimino al cliente: ${client.name}`);

        res.json({ message: 'Client removed' });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

// @desc    Get stats for a client
// @route   GET /api/clients/:id/stats
// @access  Private
exports.getClientStats = async (req, res) => {
    const { id } = req.params;

    try {
        const client = await Client.findById(id);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        // Get all bookings for this client that have arrived and already occurred
        const bookings = await Booking.find({
            $or: [
                { client: client._id },
                { clientName: client.name },
            ],
            status: 'Llegó' // Only bookings where client arrived
        }).populate('court', 'pricing');

        // Calculate financial stats based on court pricing and only past bookings
        const guatemalaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Guatemala"}));
        
        // Filter for bookings that have already occurred
        const pastBookings = [];
        for (const booking of bookings) {
            const bookingDate = new Date(booking.date);
            // Only count bookings that have already occurred (including time)
            if (bookingDate < guatemalaTime) {
                pastBookings.push(booking);
            }
        }

        let totalBookings = 0;
        let arrivedBookings = 0;
        let totalDeposit = 0;
        let totalCalculatedPrice = 0;
        let lastBooking = null;

        for (const booking of pastBookings) {
            totalBookings++;
            arrivedBookings++; // We already filtered for 'Llegó' status
            
            // Calculate the actual price based on court pricing and time slot
            let calculatedPrice = 0;
            if (booking.court && booking.timeSlot) {
                const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                const courtPricing = booking.court.pricing;
                
                // Determine price based on time range
                if (bookingHour === 6) {
                    calculatedPrice = courtPricing.sixAM || 0;
                } else if (bookingHour >= 7 && bookingHour <= 15) {
                    calculatedPrice = courtPricing.sevenToFifteen || 0;
                } else if (bookingHour >= 16 && bookingHour <= 21) {
                    calculatedPrice = courtPricing.sixteenToTwentyOne || 0;
                } else if (bookingHour === 22) {
                    calculatedPrice = courtPricing.twentyTwo || 0;
                } else if (bookingHour === 23) {
                    calculatedPrice = courtPricing.twentyThree || 0;
                }
                
                totalCalculatedPrice += calculatedPrice;
            }
            
            totalDeposit += booking.deposit || 0;
            
            // Track last booking
            const bookingDate = new Date(booking.date);
            if (!lastBooking || bookingDate > lastBooking) {
                lastBooking = bookingDate;
            }
        }

        const arrivalRate = totalBookings > 0 ? arrivedBookings / totalBookings : 0;
        const avgCalculatedPrice = arrivedBookings > 0 ? totalCalculatedPrice / arrivedBookings : 0;

        res.json({
            client: { _id: client._id, name: client.name, email: client.email, phone: client.phone },
            totalBookings,
            arrivedBookings,
            arrivalRate,
            totalDeposit, // Original deposit amount
            totalCalculatedPrice, // New calculated price based on court pricing
            avgCalculatedPrice,
            lastBooking,
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};
exports.getClientBookings = async (req, res) => {
    const { id } = req.params;

    try {
        const client = await Client.findById(id);
        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        const bookings = await Booking.find({
            $or: [
                { client: client._id },
                { clientName: client.name },
            ],
        })
            .populate('court', ['name', 'pricing'])
            .sort({ date: -1 });

        // Calculate the actual price based on court pricing and time slot for each booking
        const bookingsWithCalculatedPrice = bookings.map(booking => {
            let calculatedPrice = 0;
            if (booking.court && booking.timeSlot) {
                const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                const courtPricing = booking.court.pricing;
                
                // Determine price based on time range
                if (bookingHour === 6) {
                    calculatedPrice = courtPricing.sixAM || 0;
                } else if (bookingHour >= 7 && bookingHour <= 15) {
                    calculatedPrice = courtPricing.sevenToFifteen || 0;
                } else if (bookingHour >= 16 && bookingHour <= 21) {
                    calculatedPrice = courtPricing.sixteenToTwentyOne || 0;
                } else if (bookingHour === 22) {
                    calculatedPrice = courtPricing.twentyTwo || 0;
                } else if (bookingHour === 23) {
                    calculatedPrice = courtPricing.twentyThree || 0;
                }
            }
            
            return {
                ...booking.toObject(),
                calculatedPrice
            };
        });

        res.json(bookingsWithCalculatedPrice);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};