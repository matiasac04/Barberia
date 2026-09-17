// ── Formato de fechas e ISO ───────────────────────────
const dateFormatter = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

export const safeClone = (value) => (typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value)))

export const toIsoDate = (value) => {
  const d = value instanceof Date ? value : new Date(`${String(value).trim().split('T')[0]}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const isBlockedWeekday = (weekday) => weekday === 0 || weekday === 1

export const formatCalendarLabel = (date) => {
  const [weekday, day, month] = dateFormatter.format(date).split(' ')
  return { label: weekday.replace('.', ''), date: `${day} ${month}` }
}

export const getWeekdayPattern = (date) => {
  const weekday = date.getDay()
  if (isBlockedWeekday(weekday)) return null
  const mapping = { 1: 'mon', 2: 'tue', 3: 'wed', 4: 'thu', 5: 'fri', 6: 'sat' }
  return mapping[weekday] ?? null
}

export const resolveCalendarDetails = (bookingDate) => {
  const dateStr = String(bookingDate).trim().split('T')[0]
  const d = new Date(`${dateStr}T00:00:00`)
  const pat = getWeekdayPattern(d)
  const lbl = formatCalendarLabel(d)
  return { dayId: pat ?? 'sun', dayLabel: lbl.label, dayDate: lbl.date }
}

// ── Slots y horarios laborales ────────────────────────
export const SLOT_MINUTES = 30
export const WORKING_DAYS = [2, 3, 4, 5, 6]
const weekdayPatternToDay = { tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }

const timeToMin = (time) => {
  const p = String(time).split(':').map(Number)
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}
const minToTime = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

const generateSlotsFromRange = (start, end) => {
  const slots = []
  const s = timeToMin(start)
  const e = timeToMin(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return slots
  for (let m = s; m <= e; m += SLOT_MINUTES) slots.push(minToTime(m))
  return slots
}

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
export const parseBookingDateTime = (booking) => {
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

export const canCancelBooking = (booking) => {
  const dt = parseBookingDateTime(booking)
  if (!dt) return false
  return (dt.getTime() - Date.now()) / 36e5 > 24
}

export const resolveBookingStatus = (estado, bookingDate, time) => {
  const e = String(estado ?? '')
  if (e === 'Cancelado' || e === 'cancelled') return 'cancelled'
  if (e === 'Completado' || e === 'completed') return 'completed'
  if (e === 'NoSePresento' || e === 'no-show') return 'no-show'
  const fechaIso = String(bookingDate ?? '').split('T')[0]
  const yaPaso = fechaIso && time ? new Date(`${fechaIso}T${time}:00`) < new Date() : false
  return yaPaso ? 'expired' : 'pending'
}

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
const getDateBlockoutRows = (dateBlockouts, barberId, bookingDate) => {
  if (!Array.isArray(dateBlockouts)) return []
  const dateStr = String(bookingDate).trim().split('T')[0]
  return dateBlockouts.filter((b) => String(b.idProfesional) === String(barberId) && String(b.fecha).trim().split('T')[0] === dateStr)
}

export const getDateBlockedSlots = (dateBlockouts, barberId, bookingDate, timeSlots) => {
  const rows = getDateBlockoutRows(dateBlockouts, barberId, bookingDate)
  if (rows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return Array.isArray(timeSlots) ? timeSlots : []
  return rows.map((r) => r.hora)
}

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
