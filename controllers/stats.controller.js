const Booking = require('../models/Booking');
const Client = require('../models/Client');
const Court = require('../models/Court');
const { createLog } = require('./log.controller');
const XLSX = require('xlsx');
const ExcelJS = require('exceljs');

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
        
        const clients = await Client.find();
        
        const clientStats = await Promise.all(clients.map(async (client) => {
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
            
            let totalCalculatedIncome = 0;
            for (const booking of bookings) {
                if (booking.status === 'Llegó' && booking.court && booking.timeSlot) {
                    const bookingHour = parseInt(booking.timeSlot.split(':')[0]);
                    const courtPricing = booking.court.pricing;
                    
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
                nombre: client.name,
                email: client.email || '',
                telefono: client.phone || '',
                totalReservas: bookingsCount,
                asistencias: attendanceCount,
                tasaAsistencia: `${(attendanceRate * 100).toFixed(1)}%`,
                ingresosCalculados: totalCalculatedIncome
            };
        }));
        
        const wb = new ExcelJS.Workbook();
        wb.creator = 'VillaGol';
        wb.created = new Date();

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00695C' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerBorder = {
            top: { style: 'thin', color: { argb: 'FF004D40' } },
            bottom: { style: 'thin', color: { argb: 'FF004D40' } },
            left: { style: 'thin', color: { argb: 'FF004D40' } },
            right: { style: 'thin', color: { argb: 'FF004D40' } }
        };
        const cellBorder = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
        const altRowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        const titleFont = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF00695C' } };
        const subtitleFont = { size: 10, name: 'Calibri', color: { argb: 'FF757575' } };

        const ws = wb.addWorksheet('Estadísticas de Clientes', { properties: { tabColor: { argb: 'FF00695C' } } });

        ws.getColumn(1).width = 6;
        ws.getColumn(2).width = 28;
        ws.getColumn(3).width = 28;
        ws.getColumn(4).width = 16;
        ws.getColumn(5).width = 16;
        ws.getColumn(6).width = 14;
        ws.getColumn(7).width = 18;
        ws.getColumn(8).width = 20;

        ws.mergeCells('A1:H1');
        const titleCell = ws.getCell('A1');
        titleCell.value = 'Estadísticas de Clientes - VillaGol';
        titleCell.font = titleFont;
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(1).height = 30;

        ws.mergeCells('A2:H2');
        const subtitleCell = ws.getCell('A2');
        const periodLabel = type === 'week' ? 'Esta semana' : type === 'month' ? 'Este mes' : 'Este año';
        subtitleCell.value = `Periodo: ${periodLabel} | Generado: ${new Date().toLocaleDateString('es-GT')}`;
        subtitleCell.font = subtitleFont;
        subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        ws.getRow(2).height = 22;

        ws.getRow(3).height = 8;

        const headerRow = ws.getRow(4);
        headerRow.values = ['#', 'Nombre', 'Email', 'Telefono', 'Total Reservas', 'Asistencias', 'Tasa Asistencia', 'Ingresos Calculados'];
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = headerBorder;
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        headerRow.height = 26;

        clientStats.forEach((row, idx) => {
            const dataRow = ws.addRow([idx + 1, row.nombre, row.email, row.telefono, row.totalReservas, row.asistencias, row.tasaAsistencia, row.ingresosCalculados]);
            dataRow.eachCell((cell, colNumber) => {
                cell.border = cellBorder;
                cell.alignment = { vertical: 'middle', horizontal: colNumber <= 4 ? 'left' : 'center' };
                cell.font = { size: 10, name: 'Calibri' };
                if (idx % 2 === 1) {
                    cell.fill = altRowFill;
                }
            });
        });
        
        const excelBuffer = await wb.xlsx.writeBuffer();
        
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

// @desc    Obtener reporte anual de clientes (veces jugadas por mes)
// @route   GET /api/stats/clients/annual-report
// @access  Private/Admin
exports.getClientAnnualReport = async (req, res) => {
    try {
        const now = new Date();
        const currentYear = now.getFullYear();
        
        // Rango: 1 de enero al 31 de diciembre del año en curso
        const startDate = new Date(currentYear, 0, 1);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(currentYear, 11, 31);
        endDate.setHours(23, 59, 59, 999);
        
        // Obtener todos los clientes
        const clients = await Client.find().sort({ name: 1 });
        
        // Obtener todas las reservas asistidas del año en curso de una sola vez
        const bookings = await Booking.find({
            date: { $gte: startDate, $lte: endDate },
            status: 'Llegó'
        });
        
        // Crear un mapa de clientName -> array de 12 meses
        // También mapear por client ObjectId
        const clientBookingMap = new Map();
        
        for (const booking of bookings) {
            const bookingDate = new Date(booking.date);
            const month = bookingDate.getMonth(); // 0-11
            
            // Buscar por clientName (más confiable ya que siempre existe)
            const key = booking.clientName?.trim();
            if (!key) continue;
            
            if (!clientBookingMap.has(key)) {
                clientBookingMap.set(key, new Array(12).fill(0));
            }
            clientBookingMap.get(key)[month]++;
        }
        
        // Construir el resultado
        const result = clients.map(client => {
            const months = clientBookingMap.get(client.name) || new Array(12).fill(0);
            const total = months.reduce((sum, count) => sum + count, 0);
            
            return {
                name: client.name,
                phone: client.phone || '',
                months,
                total
            };
        });
        
        await createLog(req.user.name, `Consultó reporte anual de clientes ${currentYear}`);
        res.json({ year: currentYear, clients: result });
    } catch (error) {
        console.error('Error al obtener reporte anual de clientes:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// @desc    Obtener estadísticas de no-shows (clientes que no llegaron)
// @route   GET /api/stats/no-shows
// @access  Private/Admin
exports.getNoShowStats = async (req, res) => {
    try {
        const { type = 'month', startDate: customStart, endDate: customEnd, courtId } = req.query;

        let startDate, endDate;

        if (customStart && customEnd) {
            startDate = new Date(customStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            const dates = getPeriodDates(type);
            startDate = dates.startDate;
            endDate = dates.endDate;
        }

        const bookingFilter = {
            date: { $gte: startDate, $lte: endDate },
            status: 'No llegó'
        };

        if (courtId) {
            bookingFilter.court = courtId;
        }

        const clients = await Client.find();

        const noShowStats = await Promise.all(clients.map(async (client) => {
            const clientBookingFilter = {
                $or: [
                    { client: client._id },
                    { clientName: client.name }
                ],
                date: { $gte: startDate, $lte: endDate }
            };

            if (courtId) {
                clientBookingFilter.court = courtId;
            }

            const clientBookings = await Booking.find(clientBookingFilter)
                .populate('court');

            const totalBookings = clientBookings.length;
            const noShowBookings = clientBookings.filter(b => b.status === 'No llegó');
            const noShowCount = noShowBookings.length;
            const noShowRate = totalBookings > 0 ? noShowCount / totalBookings : 0;

            const noShowDetails = noShowBookings.map(b => ({
                date: b.date,
                timeSlot: b.timeSlot,
                courtName: b.court ? b.court.name : 'Cancha eliminada',
                deposit: b.deposit || 0
            })).sort((a, b) => new Date(b.date) - new Date(a.date));

            return {
                _id: client._id,
                name: client.name,
                phone: client.phone || '',
                totalBookings,
                noShowCount,
                noShowRate,
                noShowDetails
            };
        }));

        const filteredStats = noShowStats
            .filter(s => s.noShowCount > 0)
            .sort((a, b) => b.noShowCount - a.noShowCount);

        await createLog(req.user.name, `Consultó reporte de inasistencias`);
        res.json(filteredStats);
    } catch (error) {
        console.error('Error al obtener estadísticas de no-shows:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};

// @desc    Exportar datos de no-shows a Excel
// @route   GET /api/stats/no-shows/export
// @access  Private/Admin
exports.exportNoShowsToExcel = async (req, res) => {
    try {
        const { type = 'month', startDate: customStart, endDate: customEnd, courtId } = req.query;

        let startDate, endDate;

        if (customStart && customEnd) {
            startDate = new Date(customStart);
            startDate.setHours(0, 0, 0, 0);
            endDate = new Date(customEnd);
            endDate.setHours(23, 59, 59, 999);
        } else {
            const dates = getPeriodDates(type);
            startDate = dates.startDate;
            endDate = dates.endDate;
        }

        const clients = await Client.find();

        const clientStatsData = [];
        const detailData = [];
        let rowNum = 0;
        let detailRowNum = 0;

        for (const client of clients) {
            const clientBookingFilter = {
                $or: [
                    { client: client._id },
                    { clientName: client.name }
                ],
                date: { $gte: startDate, $lte: endDate }
            };

            if (courtId) {
                clientBookingFilter.court = courtId;
            }

            const clientBookings = await Booking.find(clientBookingFilter)
                .populate('court');

            const totalBookings = clientBookings.length;
            const noShowBookings = clientBookings.filter(b => b.status === 'No llegó');
            const noShowCount = noShowBookings.length;
            const noShowRate = totalBookings > 0 ? (noShowCount / totalBookings * 100).toFixed(1) + '%' : '0.0%';

            if (noShowCount > 0) {
                rowNum++;
                clientStatsData.push({
                    '#': rowNum,
                    'Cliente': client.name,
                    'Telefono': client.phone || '',
                    'Total Reservas': totalBookings,
                    'No Llego': noShowCount,
                    'Tasa Inasistencia': noShowRate
                });

                for (const booking of noShowBookings) {
                    detailRowNum++;
                    detailData.push({
                        '#': detailRowNum,
                        'Cliente': client.name,
                        'Fecha': new Date(booking.date).toLocaleDateString('es-GT'),
                        'Hora': booking.timeSlot,
                        'Cancha': booking.court ? booking.court.name : 'Cancha eliminada',
                        'Anticipo': booking.deposit || 0
                    });
                }
            }
        }

        const wb = new ExcelJS.Workbook();
        wb.creator = 'VillaGol';
        wb.created = new Date();

        const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A237E' } };
        const headerFont = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
        const headerBorder = {
            top: { style: 'thin', color: { argb: 'FF0D47A1' } },
            bottom: { style: 'thin', color: { argb: 'FF0D47A1' } },
            left: { style: 'thin', color: { argb: 'FF0D47A1' } },
            right: { style: 'thin', color: { argb: 'FF0D47A1' } }
        };
        const cellBorder = {
            top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
            right: { style: 'thin', color: { argb: 'FFE0E0E0' } }
        };
        const altRowFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F5F5' } };
        const titleFont = { bold: true, size: 14, name: 'Calibri', color: { argb: 'FF1A237E' } };
        const subtitleFont = { size: 10, name: 'Calibri', color: { argb: 'FF757575' } };

        // ===== HOJA RESUMEN =====
        const wsResumen = wb.addWorksheet('Resumen', { properties: { tabColor: { argb: 'FF1A237E' } } });

        wsResumen.getColumn(1).width = 6;
        wsResumen.getColumn(2).width = 28;
        wsResumen.getColumn(3).width = 16;
        wsResumen.getColumn(4).width = 16;
        wsResumen.getColumn(5).width = 14;
        wsResumen.getColumn(6).width = 20;

        // Título
        wsResumen.mergeCells('A1:F1');
        const titleCell = wsResumen.getCell('A1');
        titleCell.value = 'Reporte de Inasistencias - VillaGol';
        titleCell.font = titleFont;
        titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        wsResumen.getRow(1).height = 30;

        // Subtítulo
        wsResumen.mergeCells('A2:F2');
        const subtitleCell = wsResumen.getCell('A2');
        const periodText = customStart && customEnd
            ? `Periodo: ${customStart} al ${customEnd}`
            : `Periodo: ${type === 'week' ? 'Esta semana' : type === 'month' ? 'Este mes' : 'Este año'}`;
        subtitleCell.value = `${periodText} | Generado: ${new Date().toLocaleDateString('es-GT')}`;
        subtitleCell.font = subtitleFont;
        subtitleCell.alignment = { vertical: 'middle', horizontal: 'center' };
        wsResumen.getRow(2).height = 22;

        // Espacio
        wsResumen.getRow(3).height = 8;

        // Headers manuales (fila 4)
        const headerRow = wsResumen.getRow(4);
        headerRow.values = ['#', 'Cliente', 'Telefono', 'Total Reservas', 'No Llego', 'Tasa Inasistencia'];
        headerRow.eachCell((cell) => {
            cell.fill = headerFill;
            cell.font = headerFont;
            cell.border = headerBorder;
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        headerRow.height = 26;

        // Datos
        clientStatsData.forEach((row, idx) => {
            const dataRow = wsResumen.addRow([row['#'], row['Cliente'], row['Telefono'], row['Total Reservas'], row['No Llego'], row['Tasa Inasistencia']]);
            dataRow.eachCell((cell, colNumber) => {
                cell.border = cellBorder;
                cell.alignment = { vertical: 'middle', horizontal: colNumber <= 3 ? 'left' : 'center' };
                cell.font = { size: 10, name: 'Calibri' };
                if (idx % 2 === 1) {
                    cell.fill = altRowFill;
                }
            });
        });

        // ===== HOJA DETALLE =====
        const wsDetalle = wb.addWorksheet('Detalle', { properties: { tabColor: { argb: 'FFFF6F00' } } });

        wsDetalle.getColumn(1).width = 6;
        wsDetalle.getColumn(2).width = 28;
        wsDetalle.getColumn(3).width = 16;
        wsDetalle.getColumn(4).width = 16;
        wsDetalle.getColumn(5).width = 22;
        wsDetalle.getColumn(6).width = 14;

        // Título
        wsDetalle.mergeCells('A1:F1');
        const detTitle = wsDetalle.getCell('A1');
        detTitle.value = 'Detalle de Inasistencias - VillaGol';
        detTitle.font = titleFont;
        detTitle.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetalle.getRow(1).height = 30;

        wsDetalle.mergeCells('A2:F2');
        const detSub = wsDetalle.getCell('A2');
        detSub.value = `${periodText} | Generado: ${new Date().toLocaleDateString('es-GT')}`;
        detSub.font = subtitleFont;
        detSub.alignment = { vertical: 'middle', horizontal: 'center' };
        wsDetalle.getRow(2).height = 22;

        wsDetalle.getRow(3).height = 8;

        // Headers manuales (fila 4)
        const detailHeaderRow = wsDetalle.getRow(4);
        detailHeaderRow.values = ['#', 'Cliente', 'Fecha', 'Hora', 'Cancha', 'Anticipo'];
        detailHeaderRow.eachCell((cell) => {
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF6F00' } };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11, name: 'Calibri' };
            cell.border = {
                top: { style: 'thin', color: { argb: 'FFE65100' } },
                bottom: { style: 'thin', color: { argb: 'FFE65100' } },
                left: { style: 'thin', color: { argb: 'FFE65100' } },
                right: { style: 'thin', color: { argb: 'FFE65100' } }
            };
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
        });
        detailHeaderRow.height = 26;

        detailData.forEach((row, idx) => {
            const dataRow = wsDetalle.addRow([row['#'], row['Cliente'], row['Fecha'], row['Hora'], row['Cancha'], row['Anticipo']]);
            dataRow.eachCell((cell, colNumber) => {
                cell.border = cellBorder;
                cell.alignment = { vertical: 'middle', horizontal: colNumber <= 3 ? 'left' : 'center' };
                cell.font = { size: 10, name: 'Calibri' };
                if (idx % 2 === 1) {
                    cell.fill = altRowFill;
                }
            });
        });

        const excelBuffer = await wb.xlsx.writeBuffer();

        const periodLabel = customStart && customEnd
            ? `${customStart}_${customEnd}`
            : type;
        res.setHeader('Content-Disposition', `attachment; filename=no_shows_${periodLabel}_${new Date().toISOString().split('T')[0]}.xlsx`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');

        await createLog(req.user.name, `Exportó reporte de inasistencias a Excel`);
        res.send(excelBuffer);
    } catch (error) {
        console.error('Error al exportar datos de no-shows:', error);
        res.status(500).json({ message: 'Error del servidor' });
    }
};