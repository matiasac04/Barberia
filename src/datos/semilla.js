// ── Datos de semilla (fallback de arranque de la app) ──
// La fuente de verdad de la app es la base de datos (SQL Server).
// Este archivo solo es un "respaldo" para que la app tenga algo
// con qué pintar si la DB no devuelve información.

// timeSlots: lista de horarios fijos que se usa como "plan B".
// Cuando un profesional NO tiene horario laboral cargado en la DB
// (tabla HorarioLaboral), se usan estos horarios para mostrar
// los turnos disponibles en el calendario.
//
//   Mañana: 09:00 a 12:00  (turnos de 30 minutos)
//   Almuerzo (break): 12:30 a 14:30 no aparece porque cierra la barbería
//   Tarde: 15:00 a 17:00
// Cada hora 'HH:MM' es un horario de inicio posible de turno.
export const timeSlots = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '15:00', '15:30', '16:00', '16:30', '17:00']