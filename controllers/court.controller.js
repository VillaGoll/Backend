const Court = require('../models/Court');
const { createLog } = require('./log.controller');

const toNonNegative = (v) => {
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return 0;
    return n;
};

// Crear una nueva cancha (solo para administradores)
exports.createCourt = async (req, res) => {
    // Lógica para verificar si el usuario es administrador
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado' });
    }

    const { name, color, createOriginal, pricing } = req.body;

    // Validaciones básicas para precios
    const safePricing = {
        sixAM: toNonNegative(pricing?.sixAM),
        sevenToFifteen: toNonNegative(pricing?.sevenToFifteen),
        sixteenToTwentyOne: toNonNegative(pricing?.sixteenToTwentyOne),
        twentyTwo: toNonNegative(pricing?.twentyTwo),
        twentyThree: toNonNegative(pricing?.twentyThree),
    };

    try {
        const newCourt = new Court({ name, color, isOriginal: false, pricing: safePricing });
        const court = await newCourt.save();

        if (createOriginal) {
            const originalCourt = new Court({
                name: `${name} (Original)`,
                color,
                isOriginal: true,
                pricing: safePricing,
            });
            await originalCourt.save();
        }

        await createLog(req.user.name, `Creo la cancha ${court.name}`);
        res.json(court);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Obtener todas las canchas originales
exports.getOriginalCourts = async (req, res) => {
    try {
        const courts = await Court.find({ isOriginal: true });
        
        res.json(courts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Obtener todas las canchas
exports.getCourts = async (req, res) => {
    try {
        const courts = await Court.find({ isOriginal: false });
        
        res.json(courts);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Actualizar una cancha (solo para administradores)
exports.updateCourt = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado' });
    }

    const { name, color, pricing } = req.body;

    try {
        let court = await Court.findById(req.params.id);
        if (!court) return res.status(404).json({ msg: 'Cancha no encontrada' });

        court.name = name || court.name;
        court.color = color || court.color;

        if (pricing) {
            court.pricing = {
                sixAM: toNonNegative(pricing.sixAM ?? court.pricing?.sixAM),
                sevenToFifteen: toNonNegative(pricing.sevenToFifteen ?? court.pricing?.sevenToFifteen),
                sixteenToTwentyOne: toNonNegative(pricing.sixteenToTwentyOne ?? court.pricing?.sixteenToTwentyOne),
                twentyTwo: toNonNegative(pricing.twentyTwo ?? court.pricing?.twentyTwo),
                twentyThree: toNonNegative(pricing.twentyThree ?? court.pricing?.twentyThree),
            };
        }

        await court.save();
        await createLog(req.user.name, `Actualizo la cancha ${court.name}`);
        res.json(court);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};

// Eliminar una cancha (solo para administradores)
exports.deleteCourt = async (req, res) => {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ msg: 'Acceso denegado' });
    }

    try {
        const court = await Court.findById(req.params.id);
        if (!court) return res.status(404).json({ msg: 'Cancha no encontrada' });

        await Court.findByIdAndDelete(req.params.id);
        await createLog(req.user.name, `Elimino la cancha ${court.name}`);
        res.json({ msg: 'Cancha eliminada' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Error en el servidor');
    }
};