const Booking = require('../models/Booking');
const Client = require('../models/Client');
const Court = require('../models/Court');
const { createLog } = require('./log.controller');
const XLSX = require('xlsx');

// Función auxiliar para obtener fechas de inicio y fin según el tipo de período
const getPeriodDates = (periodType) => {
    const now = new Date();
    let startDate, endDate;
    
    switch (periodType) {
        case 'week':
            // Inicio de la semana (lunes)
            startDate = new Date(now);
            startDate.setDate(now.getDate() - now.getDay() + (now.getDay() === 0 ? -6 : 1));
            startDate.setHours(0, 0, 0, 0);
            // Fin de la semana siguiente (domingo)
            endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + 6);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'month':
            // Inicio del mes
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            startDate.setHours(0, 0, 0, 0);
            // Fin del mes
            endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            endDate.setHours(23, 59, 59, 999);
            break;
        case 'year':
            // Inicio del año
            startDate = new Date(now.getFullYear(), 0, 1);
            startDate.setHours(0, 0, 0, 0);
            // Fin del año
            endDate = new Date(now.getFullYear(), 11, 31);
            endDate.setHours(23, 59, 59, 999);
            break;
        default:
            // Por defecto, última semana
            startDate = new Date(now);
            startDate.setDate(now.getDate() - 7);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(now);
            endDate.setHours(23, 59, 59, 999);
    }
    
    return { startDate, endDate };
};

// @desc    Obtener estadísticas de clientes
// @route   GET /api/stats/clients
// @access  Private/Admin
exports.getClientStats = async (req, res) => {
    try {
        const { type = 'week' } = req.query;
        const { startDate, endDate } = getPeriodDates(type);
        
        // Obtener todos los clientes
        const clients = await Client.find();
        
        // Para cada cliente, calcular estadísticas
        const clientStats = await Promise.all(clients.map(async (client) => {
            // Buscar reservas del cliente en el período
            const bookings = await Booking.find({
                $or: [
                    { client: client._id },
                    { clientName: client.name }
                ],
                date: { $gte: startDate, $lte: endDate }
            }).populate('court', 'pricing');
            
            const bookingsCount = bookings.length;
            const attendanceCount = bookings.filter(b => b.status === 'Llegó').length;
            const attendanceRate = bookingsCount > 0 ? attendanceCount / bookingsCount : 0;
            
            // Calcular ingresos basados en el precio real de la cancha para las reservas asistidas
            let totalCalculatedIncome = 0;
            for (const booking of bookings) {
                if (booking.status === 'Llegó' && booking.court && booking.timeSlot) {
                    const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                    const courtPricing = booking.court.pricing;
                    
                    // Determinar el precio según el rango horario
                    let price = 0;
                    if (bookingHour === 6) {
                        price = courtPricing.sixAM || 0;
                    } else if (bookingHour >= 7 && bookingHour <= 15) {
                        price = courtPricing.sevenToFifteen || 0;
                    } else if (bookingHour >= 16 && bookingHour <= 21) {
                        price = courtPricing.sixteenToTwentyOne || 0;
                    } else if (bookingHour === 22) {
                        price = courtPricing.twentyTwo || 0;
                    } else if (bookingHour === 23) {
                        price = courtPricing.twentyThree || 0;
                    }
                    
                    totalCalculatedIncome += price;
                }
            }
            
            return {
                _id: client._id,
                name: client.name,
                email: client.email || '',
                phone: client.phone || '',
                bookingsCount,
                attendanceCount,
                attendanceRate,
                totalCalculatedIncome
            };
        }));
        
        await createLog(req.user.name, `Consultó estadísticas de clientes (${type})`);
        res.json(clientStats);
    } catch (error) {
        console.error('Error al obtener estadísticas de clientes:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// @desc    Obtener estadísticas financieras
// @route   GET /api/stats/financial
// @access  Private/Admin
exports.getFinancialStats = async (req, res) => {
    try {
        const { type = 'week' } = req.query;
        const { startDate, endDate } = getPeriodDates(type);
        
        // Obtener todas las reservas en el período que hayan pasado y donde el cliente llegó
        const bookings = await Booking.find({
            date: { $gte: startDate, $lte: endDate },
            status: 'Llegó' // Solo reservas donde el cliente llegó
        }).populate('court', 'name pricing');
        
        // Calcular ingresos totales basados en el precio real de las canchas según hora
        let totalIncome = 0;
        const byPeriod = [];
        const dateMap = new Map();
        const courtMap = new Map();
        const scheduleMap = new Map();
        
        // Obtener la fecha actual en Guatemala
        const guatemalaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Guatemala"}));
        
        // Procesar cada reserva y acumular estadísticas adecuadamente
        for (const booking of bookings) {
            if (!booking.court) continue;
            
            // Usar la fecha del booking y combinarla con la hora para comparación precisa
            const bookingDate = new Date(booking.date);
            
            // Solo contamos reservas que hayan ocurrido ya (hora y fecha pasadas)
            if (bookingDate < guatemalaTime) {
                // Calcular el precio real basado en la hora de la reserva y la tarifa de la cancha
                const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                const courtPricing = booking.court.pricing;
                let price = 0;
                
                // Determinar el precio según el rango horario
                if (bookingHour === 6) {
                    price = courtPricing.sixAM || 0;
                } else if (bookingHour >= 7 && bookingHour <= 15) {
                    price = courtPricing.sevenToFifteen || 0;
                } else if (bookingHour >= 16 && bookingHour <= 21) {
                    price = courtPricing.sixteenToTwentyOne || 0;
                } else if (bookingHour === 22) {
                    price = courtPricing.twentyTwo || 0;
                } else if (bookingHour === 23) {
                    price = courtPricing.twentyThree || 0;
                }
                
                totalIncome += price;
                
                // Agrupar por fecha
                const dateStr = bookingDate.toISOString().split('T')[0];
                
                if (!dateMap.has(dateStr)) {
                    dateMap.set(dateStr, { date: dateStr, income: 0 });
                }
                
                const dateEntry = dateMap.get(dateStr);
                dateEntry.income += price;
                
                // Agrupar por cancha
                const courtId = booking.court._id.toString();
                const courtName = booking.court.name;
                
                if (!courtMap.has(courtId)) {
                    courtMap.set(courtId, { courtId, courtName, income: 0 });
                }
                
                const courtEntry = courtMap.get(courtId);
                courtEntry.income += price;
                
                // Agrupar por horario
                if (!scheduleMap.has(bookingHour)) {
                    scheduleMap.set(bookingHour, { hour: bookingHour, income: 0 });
                }
                
                const scheduleEntry = scheduleMap.get(bookingHour);
                scheduleEntry.income += price;
            }
        }
        
        // Convertir los mapas a arrays
        dateMap.forEach(value => byPeriod.push(value));
        byPeriod.sort((a, b) => new Date(a.date) - new Date(b.date));
        const byCourt = Array.from(courtMap.values());
        const bySchedule = Array.from(scheduleMap.values()).sort((a, b) => a.hour - b.hour);
        
        await createLog(req.user.name, `Consultó estadísticas financieras (${type})`);
        res.json({
            totalIncome,
            byPeriod,
            byCourt,
            bySchedule
        });
        
        // Convertir los mapas a arrays
        dateMap.forEach(value => byPeriod.push(value));
        byPeriod.sort((a, b) => new Date(a.date) - new Date(b.date));
        //const byCourt = Array.from(courtMap.values());
        //const bySchedule = Array.from(scheduleMap.values()).sort((a, b) => a.hour - b.hour);
        
        await createLog(req.user.name, `Consultó estadísticas financieras (${type})`);
        res.json({
            totalIncome,
            byPeriod,
            byCourt,
            bySchedule
        });
    } catch (error) {
        console.error('Error al obtener estadísticas financieras:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// @desc    Exportar datos de clientes a Excel
// @route   GET /api/stats/clients/export
// @access  Private/Admin
exports.exportClientsToExcel = async (req, res) => {
    try {
        const { type = 'week' } = req.query;
        const { startDate, endDate } = getPeriodDates(type);
        
        // Obtener todos los clientes
        const clients = await Client.find();
        
        // Para cada cliente, calcular estadísticas
        const clientStats = await Promise.all(clients.map(async (client) => {
            // Buscar reservas del cliente en el período
            const bookings = await Booking.find({
                $or: [
                    { client: client._id },
                    { clientName: client.name }
                ],
                date: { $gte: startDate, $lte: endDate }
            }).populate('court', 'pricing');
            
            const bookingsCount = bookings.length;
            const attendanceCount = bookings.filter(b => b.status === 'Llegó').length;
            const attendanceRate = bookingsCount > 0 ? attendanceCount / bookingsCount : 0;
            
            // Calcular ingresos basados en el precio real de la cancha para las reservas asistidas
            let totalCalculatedIncome = 0;
            for (const booking of bookings) {
                if (booking.status === 'Llegó' && booking.court && booking.timeSlot) {
                    const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                    const courtPricing = booking.court.pricing;
                    
                    // Determinar el precio según el rango horario
                    let price = 0;
                    if (bookingHour === 6) {
                        price = courtPricing.sixAM || 0;
                    } else if (bookingHour >= 7 && bookingHour <= 15) {
                        price = courtPricing.sevenToFifteen || 0;
                    } else if (bookingHour >= 16 && bookingHour <= 21) {
                        price = courtPricing.sixteenToTwentyOne || 0;
                    } else if (bookingHour === 22) {
                        price = courtPricing.twentyTwo || 0;
                    } else if (bookingHour === 23) {
                        price = courtPricing.twentyThree || 0;
                    }
                    
                    totalCalculatedIncome += price;
                }
            }
            
            return {
                ID: client._id.toString(),
                Nombre: client.name,
                Email: client.email || '',
                Teléfono: client.phone || '',
                'Total Reservas': bookingsCount,
                'Asistencias': attendanceCount,
                'Tasa de Asistencia': `${(attendanceRate * 100).toFixed(1)}%`,
                'Ingresos Calculados': totalCalculatedIncome
            };
        }));
        
        // Crear libro de Excel
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(clientStats);
        
        // Añadir hoja al libro
        XLSX.utils.book_append_sheet(wb, ws, 'Estadísticas de Clientes');
        
        // Generar buffer
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        
        // Configurar cabeceras para descarga
        res.setHeader('Content-Disposition', `attachment; filename=clientes_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await createLog(req.user.name, `Exportó estadísticas de clientes a Excel (${type})`);
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error al exportar datos de clientes:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// @desc    Exportar datos financieros a Excel
// @route   GET /api/stats/financial/export
// @access  Private/Admin
exports.exportFinancialToExcel = async (req, res) => {
    try {
        const { type = 'week' } = req.query;
        const { startDate, endDate } = getPeriodDates(type);
        
        // Obtener todas las reservas en el período que hayan pasado y donde el cliente llegó
        const bookings = await Booking.find({
            date: { $gte: startDate, $lte: endDate },
            status: 'Llegó' // Solo reservas donde el cliente llegó
        }).populate('court', 'name pricing').populate('client', 'name');
        
        // Calcular el precio real basado en el rango horario para cada reserva
        const guatemalaTime = new Date(new Date().toLocaleString("en-US", {timeZone: "America/Guatemala"}));
        
        // Filtrar solo las reservas que ya han pasado
        const validBookings = [];
        for (const booking of bookings) {
            const bookingDate = new Date(booking.date);
            if (bookingDate < guatemalaTime) {
                validBookings.push(booking);
            }
        }
        
        // Preparar datos para Excel con el precio correcto
        const bookingsData = validBookings.map(booking => {
            let price = 0;
            if (booking.court && booking.timeSlot) {
                const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                const courtPricing = booking.court.pricing;
                
                // Determinar el precio según el rango horario
                if (bookingHour === 6) {
                    price = courtPricing.sixAM || 0;
                } else if (bookingHour >= 7 && bookingHour <= 15) {
                    price = courtPricing.sevenToFifteen || 0;
                } else if (bookingHour >= 16 && bookingHour <= 21) {
                    price = courtPricing.sixteenToTwentyOne || 0;
                } else if (bookingHour === 22) {
                    price = courtPricing.twentyTwo || 0;
                } else if (bookingHour === 23) {
                    price = courtPricing.twentyThree || 0;
                }
            }
            
            return {
                ID: booking._id.toString(),
                Fecha: new Date(booking.date).toLocaleDateString(),
                Hora: booking.timeSlot,
                Cliente: booking.clientName,
                Cancha: booking.court ? booking.court.name : 'N/A',
                'Precio Real': price,
                Depósito: booking.deposit || 0,
                Estado: booking.status || 'N/A'
            };
        });
        
        // Crear libro de Excel
        const wb = XLSX.utils.book_new();
        
        // Hoja de reservas detalladas
        const wsBookings = XLSX.utils.json_to_sheet(bookingsData);
        XLSX.utils.book_append_sheet(wb, wsBookings, 'Reservas');
        
        // Calcular resúmenes para otras hojas basados en el precio real
        
        // Resumen por fecha
        const dateMap = new Map();
        for (const booking of validBookings) {
            if (!booking.court) continue;
            
            let price = 0;
            const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
            const courtPricing = booking.court.pricing;
            
            // Determinar el precio según el rango horario
            if (bookingHour === 6) {
                price = courtPricing.sixAM || 0;
            } else if (bookingHour >= 7 && bookingHour <= 15) {
                price = courtPricing.sevenToFifteen || 0;
            } else if (bookingHour >= 16 && bookingHour <= 21) {
                price = courtPricing.sixteenToTwentyOne || 0;
            } else if (bookingHour === 22) {
                price = courtPricing.twentyTwo || 0;
            } else if (bookingHour === 23) {
                price = courtPricing.twentyThree || 0;
            }
            
            const bookingDate = new Date(booking.date);
            const dateStr = bookingDate.toISOString().split('T')[0];
            
            if (!dateMap.has(dateStr)) {
                dateMap.set(dateStr, { Fecha: dateStr, Ingresos: 0, Reservas: 0 });
            }
            
            const entry = dateMap.get(dateStr);
            entry.Ingresos += price;
            entry.Reservas += 1;
        }
        
        const byDateData = Array.from(dateMap.values());
        byDateData.sort((a, b) => new Date(a.Fecha) - new Date(b.Fecha));
        
        const wsByDate = XLSX.utils.json_to_sheet(byDateData);
        XLSX.utils.book_append_sheet(wb, wsByDate, 'Por Fecha');
        
        // Resumen por cancha
        const courtMap = new Map();
        for (const booking of validBookings) {
            if (!booking.court) continue;
            
            let price = 0;
            const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
            const courtPricing = booking.court.pricing;
            
            // Determinar el precio según el rango horario
            if (bookingHour === 6) {
                price = courtPricing.sixAM || 0;
            } else if (bookingHour >= 7 && bookingHour <= 15) {
                price = courtPricing.sevenToFifteen || 0;
            } else if (bookingHour >= 16 && bookingHour <= 21) {
                price = courtPricing.sixteenToTwentyOne || 0;
            } else if (bookingHour === 22) {
                price = courtPricing.twentyTwo || 0;
            } else if (bookingHour === 23) {
                price = courtPricing.twentyThree || 0;
            }
            
            const courtName = booking.court.name;
            
            if (!courtMap.has(courtName)) {
                courtMap.set(courtName, { Cancha: courtName, Ingresos: 0, Reservas: 0 });
            }
            
            const entry = courtMap.get(courtName);
            entry.Ingresos += price;
            entry.Reservas += 1;
        }
        
        const byCourtData = Array.from(courtMap.values());
        
        const wsByCourt = XLSX.utils.json_to_sheet(byCourtData);
        XLSX.utils.book_append_sheet(wb, wsByCourt, 'Por Cancha');
        
        // Resumen por horario
        const scheduleMap = new Map();
        for (const booking of validBookings) {
            if (!booking.timeSlot) continue;
            
            let price = 0;
            if (booking.court) {
                const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                const courtPricing = booking.court.pricing;
                
                // Determinar el precio según el rango horario
                if (bookingHour === 6) {
                    price = courtPricing.sixAM || 0;
                } else if (bookingHour >= 7 && bookingHour <= 15) {
                    price = courtPricing.sevenToFifteen || 0;
                } else if (bookingHour >= 16 && bookingHour <= 21) {
                    price = courtPricing.sixteenToTwentyOne || 0;
                } else if (bookingHour === 22) {
                    price = courtPricing.twentyTwo || 0;
                } else if (bookingHour === 23) {
                    price = courtPricing.twentyThree || 0;
                }
                
                if (!scheduleMap.has(bookingHour)) {
                    scheduleMap.set(bookingHour, { Horario: bookingHour + ':00', Ingresos: 0, Reservas: 0 });
                }
                
                const entry = scheduleMap.get(bookingHour);
                entry.Ingresos += price;
                entry.Reservas += 1;
            }
        }
        
        const byScheduleData = Array.from(scheduleMap.values());
        byScheduleData.sort((a, b) => parseInt(a.Horario.split(':')[0]) - parseInt(b.Horario.split(':')[0]));
        
        const wsBySchedule = XLSX.utils.json_to_sheet(byScheduleData);
        XLSX.utils.book_append_sheet(wb, wsBySchedule, 'Por Horario');
        
        // Generar buffer
        const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
        
        // Configurar cabeceras para descarga
        res.setHeader('Content-Disposition', `attachment; filename=financiero_${type}_${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        
        await createLog(req.user.name, `Exportó estadísticas financieras a Excel (${type})`);
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error al exportar datos financieros:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};