const Log = require('../models/Log');

// Variable para controlar logs duplicados
let lastLogTimestamp = 0;
let lastLogAction = '';
let lastLogUser = '';

exports.createLog = async (user, action) => {
    try {
        // Prevenir logs duplicados verificando si es el mismo usuario, acción y dentro de un intervalo corto de tiempo
        const now = Date.now();
        const userName = user || 'Sistema';
        
        // Si es el mismo usuario, misma acción y dentro de 1 segundo, no crear log duplicado
        if (userName === lastLogUser && action === lastLogAction && (now - lastLogTimestamp) < 1000) {
            console.log('Evitando log duplicado:', userName, action);
            return;
        }
        
        // Actualizar variables de control
        lastLogTimestamp = now;
        lastLogAction = action;
        lastLogUser = userName;
        
        // Crear y guardar el log
        const newLog = new Log({ user: userName, action });
        await newLog.save();
    } catch (error) {
        console.error('Error creating log:', error);
    }
};

exports.getLogs = async (req, res) => {
    try {
        const logs = await Log.find().sort({ createdAt: -1 });
        res.status(200).json(logs);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching logs', error });
    }
};