const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const createAdminUser = require('./config/seed');
require('dotenv').config();

const app = express();

// Middleware 
app.use(cors());
app.use(express.json());

// Conexión a la base de datos
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => {
    console.log('MongoDB connected');
    const createAdminUser = require('./config/seed');
    createAdminUser();
})
.catch(err => console.log(err));

// Definir Rutas
app.use('/api/auth', require('./routes/auth.routes'));
app.use('/api/courts', require('./routes/courts.routes'));
app.use('/api/bookings', require('./routes/bookings.routes'));
app.use('/api/users', require('./routes/users.routes'));
app.use('/api/clients', require('./routes/clients.routes'));
app.use('/api/logs', require('./routes/log.routes'));

// Ruta de prueba
app.get('/', (req, res) => {
    res.send('API is running...');
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';

app.listen(PORT, HOST, () => console.log(`Server running on http://${HOST}:${PORT}`));