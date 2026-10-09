// ═══════════════════════════════════════════════════════════════════
// UTILIDADES DE FECHAS, HORARIOS Y ESTADOS
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONAN ESTAS FUNCIONES?
//
// Este módulo concentra TODA la lógica pura (sin efectos ni estado React)
// relacionada con fechas, horarios y disponibilidad. Eso permite:
// - Reutilizarla en App.jsx, Inicio.jsx, MisTurnos.jsx, Admin/Horarios.jsx, etc.
// - Mantener las reglas de negocio en UN SOLO LUGAR (ventana de 30 días,
//   días cerrados, horarios de 30 min, >24h para cancelar).
// - Hacerla fácil de testear (solo recibe datos y devuelve resultados).
//
// Convención: trabaja con fechas en formato 'YYYY-MM-DD' (ISO sin hora)
// para evitar problemas de zona horaria al comparar días.
//
// FLUJO BÁSICO:
// 1. fechaAIso() normaliza cualquier valor a 'YYYY-MM-DD'
// 2. patronDelDia() traduce getDay() (JS) a patrón (lun/mar/mie/jue/vie/sab)
// 3. horariosDeLaSemana() arma horarios del día: primero busca HorarioLaboral (DB),
//    si no hay, usa horariosRespaldo (semilla)
// 4. horariosLibresDelDia() resta ocupados + bloqueos + pasados de hoy → libres
// 5. estadoDelTurno() decide estado lógico (Confirmado/Expirado/Completado...)
// 6. sePuedeCancelar() aplica regla > 24 hs (frontend + backend valida)
//
// ── Formato de fechas e ISO ───────────────────────────
// formateadorFecha: formatea etiquetas cortas en español argentino
// Ejemplo: new Date('2026-10-24') → "sáb, 24 oct." (luego limpiamos el punto)
const formateadorFecha = new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })

// fechaAIso(value): pasa cualquier fecha a texto 'YYYY-MM-DD'.
// Si manda un string tipo '2026-10-24T...' se queda solo con la parte de la fecha.
// Si la fecha no es válida devuelve '' (para no mostrar "NaN").
export const fechaAIso = (value) => {
  const d = value instanceof Date ? value : new Date(`${String(value).trim().split('T')[0]}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// esDiaCerrado(weekday): ¿es domingo (0) o lunes (1)?
// Esos días la barbería cierra, así que no se pueden pedir turnos.
export const esDiaCerrado = (weekday) => weekday === 0 || weekday === 1

// formatoFecha(date): arma la etiqueta para el calendario.
// Devuelve algo como { label: 'sáb', date: '24 oct' } (sin el punto del día).
export const formatoFecha = (date) => {
  const [weekday, day, month] = formateadorFecha.format(date).split(' ')
  return { label: weekday.replace('.', ''), date: `${day} ${month}` }
}

// patronDelDia(date): le da a un día un nombre corto de horario.
// Acepta martes..sábado (mar/mie/jue/vie/sab) y devuelve NULL si es
// domingo o lunes (cerrado). Ese nombre se usa para unir con la tabla
// HorarioLaboral de la DB.
export const patronDelDia = (date) => {
  const weekday = date.getDay()
  if (esDiaCerrado(weekday)) return null
  const mapping = { 2: 'mar', 3: 'mie', 4: 'jue', 5: 'vie', 6: 'sab' }
  return mapping[weekday] ?? null
}

// datosDelDia(fechaIso): junta las dos funciones de arriba.
// Para una fecha de turno devuelve qué día del calendario es (idDia),
// su etiqueta corta (etiquetaDia) y el día+mes (fechaDia).
// Si cae en día cerrado, idDia queda 'dom' (domingo) como respaldo.
export const datosDelDia = (fechaIso) => {
  const dateStr = String(fechaIso).trim().split('T')[0]
  const d = new Date(`${dateStr}T00:00:00`)
  const pat = patronDelDia(d)
  const lbl = formatoFecha(d)
  return { idDia: pat ?? 'dom', etiquetaDia: lbl.label, fechaDia: lbl.date }
}

// ── Horarios laborales ────────────────────────────────
// MINUTOS_POR_SLOT: cada turno dura 30 minutos (el paso entre horarios).
const MINUTOS_POR_SLOT = 30
// DIAS_ATENCION: días que abre la barbería contados a la forma de JS
// (getDay): 2=martes, 3=miércoles, 4=jueves, 5=viernes, 6=sábado.
export const DIAS_ATENCION = [2, 3, 4, 5, 6]
// Traduce el nombre corto del día (lun/mar/...) al número que usa la DB.
const patronADia = { mar: 2, mie: 3, jue: 4, vie: 5, sab: 6 }

// horaAMinutos('09:30') -> 570 (minutos desde las 00:00). Facilita las matemáticas.
const horaAMinutos = (time) => {
  const p = String(time).split(':').map(Number)
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0)
}
// minutosAHora(570) -> '09:30' (la vuelta a texto). Siempre con 2 dígitos.
const minutosAHora = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

// generarHorariosDelRango(start, end): genera la lista de horarios posibles
// entre dos horas, saltando de 30 en 30. Ej.: '09:00'->'12:00' da
// 09:00, 09:30, ..., 12:00. Si el rango es inválido devuelve lista vacía.
const generarHorariosDelRango = (start, end) => {
  const slots = []
  const s = horaAMinutos(start)
  const e = horaAMinutos(end)
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return slots
  for (let m = s; m <= e; m += MINUTOS_POR_SLOT) slots.push(minutosAHora(m))
  return slots
}

// horariosDeLaSemana(...): los horarios que un profesional realmente atiende en
// el día elegido, según su HorarioLaboral en la DB.
// Si no tiene horario cargado para ese día (o la DB está vacía),
// usa horariosRespaldo (que suelen ser los horariosFijos de semilla.js).
export const horariosDeLaSemana = (horarioLaboral, idProfesional, patronDia, horariosRespaldo) => {
  const diaJS = patronADia[patronDia]
  const rows = (Array.isArray(horarioLaboral) ? horarioLaboral : []).filter((r) =>
    String(r.idProfesional) === String(idProfesional) && Number(r.diaSemana) === diaJS &&
    r.horaEntrada != null && r.horaSalida != null
  )
  if (rows.length === 0) return Array.isArray(horariosRespaldo) ? [...horariosRespaldo] : []
  const ranges = rows.map((r) => ({ start: r.horaEntrada, end: r.horaSalida }))
  return [...new Set(ranges.flatMap((r) => generarHorariosDelRango(r.start, r.end)))].sort()
}

// ── Parseo de turnos y estado ─────────────────────────
// fechaHoraDelTurno(booking): convierte un turno { fecha, hora }
// en un Date real y válido (para hacer cuentas de tiempo). 
// Acepta fechas y horas "sucias" (con 'T', con 'Z', con segundos...)
// y las normaliza. Si algo no se puede parsear devuelve null.
const fechaHoraDelTurno = (booking) => {
  if (!booking?.fecha || !booking?.hora) return null

  let dateStr = String(booking.fecha).trim()
  if (dateStr.includes('T')) dateStr = dateStr.split('T')[0]

  let timeStr = String(booking.hora).trim()
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

// sePuedeCancelar(booking): ¿dejamos cancelar este turno?
// Regla de negocio: solo con más de 24 hs de anticipación.
// Se compara la fecha del turno contra ahora (más de 24h = 36e5 ms * 24).
export const sePuedeCancelar = (booking) => {
  const dt = fechaHoraDelTurno(booking)
  if (!dt) return false
  return (dt.getTime() - Date.now()) / 36e5 > 24
}

// estadoDelTurno(estado, fechaIso, hora): calcula el estado lógico
// de un turno para mostrarlo en la UI.
//   - Si la DB dice Cancelado/Completado/NoSePresento, se respeta eso.
//   - Si quedó 'Confirmado' pero la hora ya pasó, se muestra 'Expirado'.
//   - Si no, 'Confirmado' (falta que ocurra).
export const estadoDelTurno = (estado, fechaIso, hora) => {
  const e = String(estado ?? '')
  if (e === 'Cancelado') return 'Cancelado'
  if (e === 'Completado') return 'Completado'
  if (e === 'NoSePresento') return 'NoSePresento'
  const dateStr = String(fechaIso ?? '').split('T')[0]
  const yaPaso = dateStr && hora ? new Date(`${dateStr}T${hora}:00`) < new Date() : false
  return yaPaso ? 'Expirado' : 'Confirmado'
}

// formatoCuentaRegresiva(booking): arma el texto de "cuánto falta" para el turno.
// Ej.: "En 2 días a las 10:00", "Hoy a las 16:30 · faltan 3 h", "En 25 min".
// Si el turno ya pasó devuelve "Ya pasó".
export const formatoCuentaRegresiva = (booking) => {
  const dt = fechaHoraDelTurno(booking)
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
// filasDeBloqueo(...): filtra los bloqueos que el admin cargó
// para UN profesional y UNA fecha puntual (tabla BloqueoHorario).
const filasDeBloqueo = (bloqueosPorFecha, idProfesional, fecha) => {
  if (!Array.isArray(bloqueosPorFecha)) return []
  const dateStr = String(fecha).trim().split('T')[0]
  return bloqueosPorFecha.filter((b) => String(b.idProfesional) === String(idProfesional) && String(b.fecha).trim().split('T')[0] === dateStr)
}

// bloqueosDeLaFecha(...): los horarios bloqueados de un día puntual.
// Si el bloqueo es de "todo el día" (hora vacía), devuelve TODA la lista
// de horarios (o sea: no hay nada disponible). Si no, solo los que marcó.
export const bloqueosDeLaFecha = (bloqueosPorFecha, idProfesional, fecha, horariosFijos) => {
  const rows = filasDeBloqueo(bloqueosPorFecha, idProfesional, fecha)
  if (rows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return Array.isArray(horariosFijos) ? horariosFijos : []
  return rows.map((r) => r.hora)
}

// horariosPasados(fecha, horarios, ahora): de UNA fecha, los horarios que ya
// arrancaron. Solo aplica si esa fecha es HOY; cualquier otro día devuelve [].
// Es la regla "no se puede sacar un turno en un horario que ya pasó" (el
// backend además la rechaza con 400 en POST /turnos y PATCH /turnos/:id).
export const horariosPasados = (fecha, horarios, ahora = new Date()) => {
  const dateStr = String(fecha).trim().split('T')[0]
  if (dateStr !== fechaAIso(ahora)) return []
  const minAhora = ahora.getHours() * 60 + ahora.getMinutes()
  return (Array.isArray(horarios) ? horarios : []).filter((s) => horaAMinutos(s) <= minAhora)
}

// horariosLibresDelDia(...): la función principal del turnero.
// Devuelve los horarios libres de un día para un profesional:
// horario laboral (o respaldo) MENOS lo ocupado (turnosOcupados), los bloqueos
// y los horarios de hoy que ya pasaron.
// Los bloqueos de día completo hacen que la lista quede vacía.
export const horariosLibresDelDia = (turnosOcupados, idProfesional, fecha, horariosFijos, bloqueosPorFecha, horarioLaboral) => {
  const pat = patronDelDia(new Date(`${fecha}T00:00:00`))
  if (!pat) return []
  const daySlots = horariosDeLaSemana(horarioLaboral, idProfesional, pat, horariosFijos)
  const dateRows = filasDeBloqueo(bloqueosPorFecha, idProfesional, fecha)
  if (dateRows.some((r) => r.hora === null || r.hora === undefined || r.hora === '')) return []
  const dateKey = String(fecha).trim().split('T')[0]
  const blocked = new Set([...(turnosOcupados[idProfesional]?.[dateKey] ?? []), ...dateRows.map((r) => r.hora), ...horariosPasados(fecha, daySlots)])
  return daySlots.filter((s) => !blocked.has(s))
}