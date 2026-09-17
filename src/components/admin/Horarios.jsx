// ── Panel de horarios y bloqueos (semanal + puntual) ──
import { useEffect, useState } from 'react';
import { WORKING_DAYS, getDateBlockedSlots, getWeekdayPattern, getWeeklySlots, toIsoDate } from '../../utilidades/ayudantes';

// ── Constantes de fechas y días laborales ────────────
const today = new Date();
const minIso = toIsoDate(today);
const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 30);
const maxIso = toIsoDate(maxDate);

const WEEKDAY_LABELS = [
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
];

// ── Helper del formulario semanal ─────────────────────
const buildWeeklyForm = (barberId, horarioLaboral) => {
  const rows = (Array.isArray(horarioLaboral) ? horarioLaboral : []).filter((r) => String(r.idProfesional) === String(barberId));
  const form = {};
  WORKING_DAYS.forEach((day) => {
    const dayRows = rows.filter((r) => Number(r.diaSemana) === day && r.horaEntrada != null && r.horaSalida != null);
    const ranges = dayRows.slice(0, 2).map((r) => ({ in: r.horaEntrada, out: r.horaSalida }));
    while (ranges.length < 2) ranges.push({ in: '', out: '' });
    form[day] = { off: dayRows.length === 0, ranges };
  });
  return form;
};

function Horarios({ barbers, dateBlockouts, horarioLaboral, onSaveDateBlockouts, onSaveHorarios, selectedScheduleBarber, setSelectedScheduleBarber, selectedScheduleDate, setSelectedScheduleDate, timeSlots }) {
  // ── Estado y sincronización ─────────────────────────
  const [msg, setMsg] = useState(null);
  const [weeklyForm, setWeeklyForm] = useState(() => buildWeeklyForm(selectedScheduleBarber, horarioLaboral));
  const [savingWeekly, setSavingWeekly] = useState(false);

  useEffect(() => { if (selectedScheduleBarber) setWeeklyForm(buildWeeklyForm(selectedScheduleBarber, horarioLaboral)); }, [selectedScheduleBarber, horarioLaboral]);

  if (!selectedScheduleBarber || !Array.isArray(barbers) || barbers.length === 0) return <article className="simple-card admin-panel"><h2>Horarios</h2><p className="admin-note">Agregá un profesional para gestionar sus horarios.</p></article>;

  // ── Datos derivados de la fecha y bloqueos ─────────
  const weekdayPattern = getWeekdayPattern(new Date(`${selectedScheduleDate}T00:00:00`));
  const cerrado = !weekdayPattern;
  const daySlots = weekdayPattern ? getWeeklySlots(horarioLaboral, selectedScheduleBarber, weekdayPattern, timeSlots) : [];
  const bloqueados = getDateBlockedSlots(dateBlockouts, selectedScheduleBarber, selectedScheduleDate, daySlots);
  const diaLibre = bloqueados.length > 0 && daySlots.length > 0 && bloqueados.length === daySlots.length;

  const actualizarRango = (day, idx, field, value) => setWeeklyForm((p) => ({ ...p, [day]: { ...p[day], ranges: p[day].ranges.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) } }));
  const toggleOff = (day) => setWeeklyForm((p) => ({ ...p, [day]: { ...p[day], off: !p[day].off } }));

  const guardarSemanal = async () => {
    const horarios = [];
    for (const day of WORKING_DAYS) {
      const d = weeklyForm[day];
      if (!d || d.off) continue;
      for (const r of d.ranges) {
        if (!r.in && !r.out) continue;
        if (!r.in || !r.out) {
          setMsg({ type: 'error', message: `En ${WEEKDAY_LABELS.find((w) => w.day === day)?.label} cargaste un bloque incompleto: completá entrada y salida o vaciá ambos campos.` });
          return false;
        }
        if (r.out <= r.in) {
          setMsg({ type: 'error', message: `En ${WEEKDAY_LABELS.find((w) => w.day === day)?.label} la salida debe ser posterior a la entrada.` });
          return false;
        }
        horarios.push({ diaSemana: day, horaEntrada: r.in, horaSalida: r.out });
      }
    }
    setSavingWeekly(true);
    const ok = await onSaveHorarios(selectedScheduleBarber, horarios);
    setSavingWeekly(false);
    setMsg(ok ? { type: 'success', message: 'Horario semanal guardado.' } : { type: 'error', message: 'No se pudieron guardar los horarios semanales. Revisá que estés conectado y con el servidor activo.' });
    return ok;
  };

  const editar = async (body) => {
    const ok = await onSaveDateBlockouts(selectedScheduleBarber, selectedScheduleDate, body);
    setMsg(ok ? { type: 'success', message: 'Bloqueos guardados.' } : { type: 'error', message: 'No se pudieron guardar los cambios. Revisá que estés conectado y con el servidor activo.' });
    return ok;
  };
  const toggleDia = async () => { await editar(diaLibre ? { slots: [] } : { diaCompleto: true }); };
  const toggleSlot = async (slot) => {
    const tiene = bloqueados.includes(slot);
    await editar({ slots: tiene ? bloqueados.filter((s) => s !== slot) : [...bloqueados, slot] });
  };

  // ── Render del panel ──────────────────────────
  return (
    <article className="simple-card admin-panel">
      <h2>Horarios</h2>
      <p className="admin-note">Definí el horario semanal de cada profesional y bloqueá días puntuales cuando lo necesites.</p>
      <div className="admin-schedule-toolbar">
        <div className="admin-select-group">
          <label>Profesional</label>
          <select value={selectedScheduleBarber} onChange={(e) => setSelectedScheduleBarber(e.target.value)}>
            {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      {msg ? <div className={`simple-feedback ${msg.type} admin-feedback`}>{msg.message}</div> : null}

      <h3 className="admin-subtitle">Horario semanal</h3>
      <p className="admin-note">Cada día puede tener hasta dos bloques (mañana y tarde) de 30 minutos en adelante. Desactivá el día si el profesional no trabaja.</p>
      <div className="weekly-horarios">
        {WEEKDAY_LABELS.map(({ day, label }) => {
          const d = weeklyForm[day];
          return (
            <div key={day} className={`weekly-day ${d?.off ? 'weekly-day-off' : ''}`}>
              <div className="weekly-day-head">
                <label className="weekly-toggle">
                  <input type="checkbox" checked={!d?.off} onChange={() => toggleOff(day)} />
                  {label}
                </label>
              </div>
              <div className="weekly-ranges">
                {(d?.ranges ?? []).map((r, i) => (
                  <div key={i} className="weekly-range">
                    <input type="time" disabled={d?.off} value={r.in} onChange={(e) => actualizarRango(day, i, 'in', e.target.value)} />
                    <span>a</span>
                    <input type="time" disabled={d?.off} value={r.out} onChange={(e) => actualizarRango(day, i, 'out', e.target.value)} />
                  </div>
                ))}
              </div>
              {d?.off ? <span className="weekly-off-badge">Descanso</span> : null}
            </div>
          );
        })}
      </div>
      <div className="admin-form-actions">
        <button type="button" className="simple-submit" disabled={savingWeekly} onClick={guardarSemanal}>{savingWeekly ? 'Guardando...' : 'Guardar horario semanal'}</button>
        {!savingWeekly && <button type="button" className="simple-submit secondary" onClick={() => { setWeeklyForm(buildWeeklyForm(selectedScheduleBarber, horarioLaboral)); setMsg(null); }}>Descartar cambios</button>}
      </div>

      <h3 className="admin-subtitle">Bloqueos puntuales</h3>
      <p className="admin-note">Elegí un día y bloqueá horarios sueltos o tomate el día completo. Los bloqueos se guardan y no se pueden reservar.</p>
      <div className="admin-schedule-toolbar">
        <div className="admin-select-group">
          <label>Día</label>
          <input type="date" min={minIso} max={maxIso} value={selectedScheduleDate} onChange={(e) => e.target.value && setSelectedScheduleDate(e.target.value)} />
        </div>
      </div>
      {cerrado ? (
        <p className="admin-note">Este día es domingo o lunes, la barbería está cerrada. Elegí un día de martes a sábado.</p>
      ) : (
        <>
          {diaLibre ? (
            <div className="admin-day-off">
              <p>Día tomado: todos los horarios están bloqueados.</p>
              <button type="button" className="simple-submit" onClick={toggleDia}>Desbloquear todo el día</button>
            </div>
          ) : (
            <button type="button" className="simple-submit" onClick={toggleDia}>Bloquear todo el día</button>
          )}
          <p className="admin-note">Tocá un horario para bloquearlo o liberarlo puntualmente.</p>
          <div className="chip-grid admin-hours-grid">
            {daySlots.map((slot) => {
              const blocked = bloqueados.includes(slot);
              return <button key={slot} type="button" className={`simple-chip ${blocked ? 'occupied' : 'selected'}`} onClick={() => toggleSlot(slot)}>{slot}<small>{blocked ? 'Bloqueado' : 'Libre'}</small></button>;
            })}
          </div>
        </>
      )}
    </article>
  );
}
export default Horarios;
