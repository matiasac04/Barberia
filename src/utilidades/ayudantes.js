// ── Formato de fechas e ISO ───────────────────────────
// Formatter con horario/idioma argentino: p. ej. sábado, 24 de oct.
const dateFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

// toIsoDate(value): pasa cualquier fecha a texto 'YYYY-MM-DD'.
// Si manda un string tipo '2026-10-24T...' se queda solo con la parte de la fecha.
// Si la fecha no es válida devuelve '' (para no mostrar "NaN").
export const toIsoDate = (value) => {
  const d = value instanceof Date ? value : new Date(`${String(value).trim().split('T')[0]}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// isBlockedWeekday(weekday): ¿es domingo (0) o lunes (1)?
// Esos días la barbería cierra, así que no se pueden pedir turnos.
export const isBlockedWeekday = (weekday) => weekday === 0 || weekday === 1

// formatCalendarLabel(date): arma la etiqueta para el calendario.
// Devuelve algo como { label: 'sáb', date: '24 oct' } (sin el punto del día).
export const formatCalendarLabel = (date) => {
  const [weekday, day, month] = dateFormatter.format(date).split(' ')
  return { label: weekday.replace('.', ''), date: `${day} ${month}` }
}

// getWeekdayPattern(date): le da a un día un nombre corto de horario.
// Acepta martes..sábado (mon/tue/wed/thu/fri/sat) y devuelve NULL si es
// domingo o lunes (cerrado). Ese nombre se usa para unir con la tabla
// HorarioLaboral de la DB.
export const getWeekdayPattern = (date) => {
  const weekday = date.getDay()
  if (isBlockedWeekday(weekday)) return null
  const mapping = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
  return mapping[weekday] ?? null
}

// resolveCalendarDetails(bookingDate): junta las dos funciones de arriba.
// Para una fecha de turno devuelve qué día del calendario es (dayId),
// su etiqueta corta (dayLabel) y el día+mes (dayDate).
// Si cae en día cerrado, dayId queda 'sun' (domingo) como fallback.
export const resolveCalendarDetails = (bookingDate) => {
  const dateStr = String(bookingDate).trim().split('T')[0]
  const d = new Date(`${dateStr}T00:00:00`)
  const pat = getWeekdayPattern(d)
  const lbl = formatCalendarLabel(d)
  return { dayId: pat ?? 'sun', dayLabel: lbl.label, dayDate: lbl.date }
}

// ── Slots y horarios laborales ────────────────────────
// SLOT_MINUTES: cada turno dura 30 minutos (el paso entre horarios).
const SLOT_MINUTES = 30
// WORKING_DAYS: días que abre la barbería contados a la forma de JS
// (getDay): 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.
export const WORKING_DAYS = [2, 3, 4, 5, 6]
// Traduce el nombre corto del día (mon/tue/...) al número que usa la DB.
const weekdayPatternToDay = { tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

// timeToMin('09:30') -> 570 (minutos desde las 00:00). Facilita las matemáticas.
const timeToMin = (time) => {
  const p = String(time).split(':').map(Number)
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}
// minToTime(570) -> '09:30' (la vuelta a texto). Siempre con 2 dígitos.
const minToTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// generateSlotsFromRange(start, end): genera la lista de horarios posibles
// entre dos horas, saltando de 30 en 30. Ej.: '09:00'->'12:00' da
// 09:00, 09:30, ..., 12:00. Si el rango es inválido devuelve lista vacía.
const generateSlotsFromRange = (start, end) => {
  const slots = []
  const s = timeToMin(start)
  const e = timeToMin(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return slots
  for (let m = s; m <= e; m += SLOT_MINUTES) slots.push(minToTime(m))
  return slots
}

// getWeeklySlots(...): los horarios que un profesional realmente atiende en
// el día elegido, según su HorarioLaboral en la DB.
// Si no tiene horario cargado para ese día (o la DB está vacía),
// usa fallbackSlots (que suelen ser los timeSlots de semilla.js).
export const getWeeklySlots = (horarioLaboral, barberId, weekdayPattern, fallbackSlots) => {
  const dayJS = weekdayPatternToDay[weekdayPattern]
  const rows = (Array.isArray(horarioLaboral) ? horarioLaboral : []).filter((r) =>
    String(r.idProfesional) === String(barberId) && Number(r.diaSemana) === dayJS &&
    r.horaEntrada != null && r.horaSalida != null
  )
  if (rows.length === 0) return Array.isArray(fallbackSlots) ? [...fallbackSlots] : []
  const ranges = rows.map((r) => ({ start: r.horaEntrada, end: r.horaSalida }))
  return [...new Set(ranges.flatMap((r) => generateSlotsFromRange(r.start, r.end)))].sort()
}

// ── Parseo de turnos y estado ─────────────────────────
// parseBookingDateTime(booking): convierte un turno { bookingDate, time }
// en un Date real y válido (para hacer cuentas de tiempo). 
// Acepta fechas y horas "sucias" (con 'T', con 'Z', con segundos...)
// y las normaliza. Si algo no se puede parsear devuelve null.
const parseBookingDateTime = (booking) => {
  if (!booking?.bookingDate || !booking?.time) return null

  let dateStr = String(booking.bookingDate).trim()
  if (dateStr.includes('T')) dateStr = dateStr.split('T')[0]

  let timeStr = String(booking.time).trim()
  if (timeStr.includes('T')) timeStr = timeStr.split('T')[1]
  timeStr = timeStr.replace('Z', '').slice(0, 8)

  const timeParts = timeStr.split(':')
  if (timeParts.length >= 2) {
    const hh = timeParts[0].padStart(2, '0')
    const mm = timeParts[1].padStart(2, '0')
    const ss = (timeParts[2] || '00').padStart(2, '0')
    timeStr = `${hh}:${mm}:${ss}`
  }

  const dt = new Date(`${dateStr}T${timeStr}`)
  return Number.isNaN(dt.getTime()) ? null : dt
}

// canCancelBooking(booking): ¿dejamos cancelar este turno?
// Regla de negocio: solo con más de 24 hs de anticipación.
// Se compara la fecha del turno contra ahora (más de 24h = 36e5 ms * 24).
export const canCancelBooking = (booking) => {
  const dt = parseBookingDateTime(booking)
  if (!dt) return false
  return (dt.getTime() - Date.now()) / 36e5 > 24
}

// resolveBookingStatus(estado, bookingDate, time): calcula el estado lógico
// de un turno para mostrarlo en la UI.
//   - Si la DB dice Cancelado/Completado/NoSePresento, se respeta eso.
//   - Si quedó 'Confirmado' pero la hora ya pasó, se muestra 'expired'.
//   - Si no, 'pending' (falta que ocurra).
export const resolveBookingStatus = (estado, bookingDate, time) => {
  const e = String(estado ?? '')
  if (e === 'Cancelado' || e === 'cancelled') return 'cancelled'
  if (e === 'Completado' || e === 'completed') return 'completed'
  if (e === 'NoSePresento' || e === 'no-show') return 'no-show'
  const fechaIso = String(bookingDate ?? '').split('T')[0]
  const yaPaso = fechaIso && time ? new Date(`${fechaIso}T${time}:00`) < new Date() : false
  return yaPaso ? 'expired' : 'pending'
}

// formatCountdown(booking): arma el texto de "cuánto falta" para el turno.
// Ej.: "En 2 días a las 10:00", "Hoy a las 16:30 · faltan 3 h", "En 25 min".
// Si el turno ya pasó devuelve "Ya pasó".
export const formatCountdown = (booking) => {
  const dt = parseBookingDateTime(booking)
  if (!dt) return ''
  const diff = dt.getTime() - Date.now()
  if (diff <= 0) return 'Ya pasó'
  const totalMin = Math.floor(diff / 6e4)
  const days = Math.floor(totalMin / 1440)
  const hours = Math.floor((totalMin % 1440) / 60)
  const minutes = totalMin % 60
  const t = `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`
  if (days > 0) return `En ${days} día${days === 1 ? '' : 's'} a las ${t}`
  if (hours > 0) return `Hoy a las ${t} · faltan ${hours} h`
  return `En ${Math.max(minutes, 1)} min`
}

// ── Bloqueos de fecha y disponibilidad ────────────────
// getDateBlockoutRows(...): filtra los bloqueos que el admin cargó
// para UN profesional y UNA fecha puntual (tabla BloqueoHorario).
const getDateBlockoutRows = (dateBlockouts, barberId, bookingDate) => {
  if (!Array.isArray(dateBlockouts)) return []
  const dateStr = String(bookingDate).trim().split('T')[0]
  return dateBlockouts.filter((b) => String(b.idProfesional) === String(barberId) && String(b.fecha).trim().split('T')[0] === dateStr)
}

// getDateBlockedSlots(...): los horarios bloqueados de un día puntual.
// Si el bloqueo es de "todo el día" (hora vacía), devuelve TODA la lista
// de horarios (o sea: no hay nada disponible). Si no, solo los que marcó.
export const getDateBlockedSlots = (dateBlockouts, barberId, bookingDate, timeSlots) => {
  const rows = getDateBlockoutRows(dateBlockouts, barberId, bookingDate)
  if (rows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return Array.isArray(timeSlots) ? timeSlots : []
  return rows.map((r) => r.hora)
}

// getDayFreeSlots(...): la función principal del turnero.
// Devuelve los horarios libres de un día para un barbero:
// horario laboral (o fallback) MINOS lo ocupado (takenSlots) y los bloqueos.
// Los bloqueos de día completo hacen que la lista quede vacía.
export const getDayFreeSlots = (takenSlots, barberId, bookingDate, timeSlots, dateBlockouts, horarioLaboral) => {
  const pat = getWeekdayPattern(new Date(`${bookingDate}T00:00:00`))
  if (!pat) return []
  const daySlots = getWeeklySlots(horarioLaboral, barberId, pat, timeSlots)
  const dateRows = getDateBlockoutRows(dateBlockouts, barberId, bookingDate)
  if (dateRows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return []
  const dateKey = String(bookingDate).trim().split('T')[0]
  const blocked = new Set([...(takenSlots[barberId]?.[dateKey] ?? []), ...dateRows.map((r) => r.hora)])
  return daySlots.filter((s) => !blocked.has(s))
}