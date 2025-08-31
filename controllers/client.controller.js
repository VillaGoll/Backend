const Client = require('../models/Client');
const Booking = require('../models/Booking');
const { createLog } = require('./log.controller');

// @desc    Create a new client
// @route   POST /api/clients
// @access  Private/Admin
exports.createClient = async (req, res) => {
    console.log("Request Body:", req.body);
    const { name, phone } = req.body;

    try {
        const clientData = {
            name,
            phone,
        }; 

        const client = new Client(clientData);

        await client.save();
        await createLog(req.user.name, `Creo al cliente: ${client.name}`);
        res.status(201).json(client);
    } catch (error) {
        console.error("Error creating client:", error);
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

    try {
        let client = await Client.findById(req.params.id);

        if (!client) {
            return res.status(404).json({ message: 'Client not found' });
        }

        client.name = name;
        client.phone = phone;

        await client.save();
        await createLog(req.user.name, `Actualizo al cliente: ${client.name}`);

        res.json(client);
    } catch (error) {
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

        // Consider both linked bookings and legacy bookings that only have clientName
        const matchStage = {
            $or: [
                { client: client._id },
                { clientName: client.name },
            ],
        };

        const aggregated = await Booking.aggregate([
            { $match: matchStage },
            {
                $addFields: {
                    dateAsDate: {
                        $cond: [
                            { $eq: [{ $type: '$date' }, 'date'] },
                            '$date',
                            {
                                $dateFromString: {
                                    dateString: '$date',
                                    timezone: 'America/Guatemala',
                                    onError: null,
                                    onNull: null,
                                },
                            },
                        ],
                    },
                },
            },
            {
                $group: {
                    _id: null,
                    totalBookings: { $sum: 1 },
                    arrivedBookings: {
                        $sum: {
                            $cond: [{ $eq: ['$status', 'Llegó'] }, 1, 0],
                        },
                    },
                    totalDeposit: { $sum: { $ifNull: ['$deposit', 0] } },
                    avgDeposit: { $avg: { $ifNull: ['$deposit', 0] } },
                    lastBooking: { $max: '$dateAsDate' },
                },
            },
        ]);

        const stats = aggregated[0] || {
            totalBookings: 0,
            arrivedBookings: 0,
            totalDeposit: 0,
            avgDeposit: 0,
            lastBooking: null,
        };

        const arrivalRate = stats.totalBookings > 0 ? stats.arrivedBookings / stats.totalBookings : 0;

        res.json({
            client: { _id: client._id, name: client.name, email: client.email, phone: client.phone },
            totalBookings: stats.totalBookings,
            arrivedBookings: stats.arrivedBookings,
            arrivalRate,
            totalDeposit: stats.totalDeposit,
            avgDeposit: stats.avgDeposit,
            lastBooking: stats.lastBooking,
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
            .populate('court', ['name'])
            .sort({ date: -1 });

        res.json(bookings);
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
};