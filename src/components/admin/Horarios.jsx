// ═══════════════════════════════════════════════════════════════════
// PANEL DE HORARIOS Y BLOQUEOS (admin)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Maneja DOS FACETAS del horario, ambas por profesional seleccionado:
//
// A) HORARIO SEMANAL (tabla HorarioLaboral):
//    - Para cada día laboral (mar–sáb) permite hasta 2 bloques
//      (ej. mañana 09:00–12:00 / tarde 15:00–17:00)
//    - Checkbox por día lo activa/desactiva (off = descanso, NO guarda filas)
//    - armarFormularioSemanal() transforma las filas de la DB en el estado del form
//    - guardarSemanal() valida cada bloque (entrada<salida, completos),
//      arma la lista de horarios y llama onGuardarHorarios (App → PUT /profesionales/:id/horarios)
//    - Si no hay filas para un día, ese día queda 'off'
//
// B) BLOQUEOS PUNTUALES (tabla BloqueoHorario):
//    - Elegí una fecha (hoy→+30). Si es domingo/lunes avisa que está cerrado.
//    - toggleDia() bloquea/desbloquea TODO el día (guarda hora=NULL)
//    - toggleSlot() bloquea/libera un horario puntual (guarda la hora)
//    - editar() llama onGuardarBloqueos (App → POST /profesionales/:id/bloqueos)
//      que REEMPLAZA los bloqueos de esa fecha.
//
// Impacto en el turno: los slots bloqueos + fuera de horario NO aparecen
// disponibles en Inicio.jsx (horariosLibresDelDia filtra).
import { useEffect, useState } from 'react';
import { DIAS_ATENCION, bloqueosDeLaFecha, patronDelDia, horariosDeLaSemana, fechaAIso } from '../../utilidades/funciones';

// ── Constantes de fechas y días laborales ────────────
// Rango para el input de fecha de bloqueo puntual: hoy → +30 días
const today = new Date();
const minIso = fechaAIso(today);
const maxDate = new Date(today); maxDate.setDate(maxDate.getDate() + 30);
const maxIso = fechaAIso(maxDate);

const DIAS = [
  { day: 2, label: 'Martes' },
  { day: 3, label: 'Miércoles' },
  { day: 4, label: 'Jueves' },
  { day: 5, label: 'Viernes' },
  { day: 6, label: 'Sábado' },
];

// ── Helper del formulario semanal ─────────────────────
const armarFormularioSemanal = (idProfesional, horarioLaboral) => {
  const rows = (Array.isArray(horarioLaboral) ? horarioLaboral : []).filter((r) => String(r.idProfesional) === String(idProfesional));
  const form = {};
  DIAS_ATENCION.forEach((day) => {
    const dayRows = rows.filter((r) => Number(r.diaSemana) === day && r.horaEntrada != null && r.horaSalida != null);
    const ranges = dayRows.slice(0, 2).map((r) => ({ in: r.horaEntrada, out: r.horaSalida }));
    while (ranges.length < 2) ranges.push({ in: '', out: '' });
    form[day] = { off: dayRows.length === 0, ranges };
  });
  return form;
};

function Horarios({ profesionales, bloqueosPorFecha, horarioLaboral, onGuardarBloqueos, onGuardarHorarios, profesionalHorario, setProfesionalHorario, fechaHorario, setFechaHorario, horariosFijos }) {
  // ── Estado y sincronización ─────────────────────────
  const [aviso, setAviso] = useState(null);
  const [formularioSemanal, setFormularioSemanal] = useState(() => armarFormularioSemanal(profesionalHorario, horarioLaboral));
  const [guardando, setGuardando] = useState(false);

  useEffect(() => { if (profesionalHorario) setFormularioSemanal(armarFormularioSemanal(profesionalHorario, horarioLaboral)); }, [profesionalHorario, horarioLaboral]);

  if (!profesionalHorario || !Array.isArray(profesionales) || profesionales.length === 0) return <article className="simple-card admin-panel"><h2>Horarios</h2><p className="admin-note">Agregá un profesional para gestionar sus horarios.</p></article>;

  // ── Datos derivados de la fecha y bloqueos ─────────
  const patronDia = patronDelDia(new Date(`${fechaHorario}T00:00:00`));
  const cerrado = !patronDia;
  const horariosDelDia = patronDia ? horariosDeLaSemana(horarioLaboral, profesionalHorario, patronDia, horariosFijos) : [];
  const bloqueos = bloqueosDeLaFecha(bloqueosPorFecha, profesionalHorario, fechaHorario, horariosDelDia);
  const diaTomado = bloqueos.length > 0 && horariosDelDia.length > 0 && bloqueos.length === horariosDelDia.length;

  const actualizarRango = (day, idx, field, value) => setFormularioSemanal((p) => ({ ...p, [day]: { ...p[day], ranges: p[day].ranges.map((r, i) => (i === idx ? { ...r, [field]: value } : r)) } }));
  const toggleOff = (day) => setFormularioSemanal((p) => ({ ...p, [day]: { ...p[day], off: !p[day].off } }));

  const guardarSemanal = async () => {
    const horarios = [];
    for (const day of DIAS_ATENCION) {
      const d = formularioSemanal[day];
      if (!d || d.off) continue;
      for (const r of d.ranges) {
        if (!r.in && !r.out) continue;
        if (!r.in || !r.out) {
          setAviso({ type: 'error', message: `En ${DIAS.find((w) => w.day === day)?.label} cargaste un bloque incompleto: completá entrada y salida o vaciá ambos campos.` });
          return false;
        }
        if (r.out <= r.in) {
          setAviso({ type: 'error', message: `En ${DIAS.find((w) => w.day === day)?.label} la salida debe ser posterior a la entrada.` });
          return false;
        }
        horarios.push({ diaSemana: day, horaEntrada: r.in, horaSalida: r.out });
      }
    }
    setGuardando(true);
    const ok = await onGuardarHorarios(profesionalHorario, horarios);
    setGuardando(false);
    setAviso(ok ? { type: 'success', message: 'Horario semanal guardado.' } : { type: 'error', message: 'No se pudieron guardar los horarios semanales. Revisá que estés conectado y con el servidor activo.' });
    return ok;
  };

  const editar = async (body) => {
    const ok = await onGuardarBloqueos(profesionalHorario, fechaHorario, body);
    setAviso(ok ? { type: 'success', message: 'Bloqueos guardados.' } : { type: 'error', message: 'No se pudieron guardar los cambios. Revisá que estés conectado y con el servidor activo.' });
    return ok;
  };
  const toggleDia = async () => { await editar(diaTomado ? { slots: [] } : { diaCompleto: true }); };
  const toggleSlot = async (slot) => {
    const tiene = bloqueos.includes(slot);
    await editar({ slots: tiene ? bloqueos.filter((s) => s !== slot) : [...bloqueos, slot] });
  };

  // ── Render del panel ──────────────────────────
  return (
    <article className="simple-card admin-panel">
      <h2>Horarios</h2>
      <p className="admin-note">Definí el horario semanal de cada profesional y bloqueá días puntuales cuando lo necesites.</p>
      <div className="admin-schedule-toolbar">
        <div className="admin-select-group">
          <label>Profesional</label>
          <select value={profesionalHorario} onChange={(e) => setProfesionalHorario(e.target.value)}>
            {profesionales.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
      </div>
      {aviso ? <div className={`simple-feedback ${aviso.type} admin-feedback`}>{aviso.message}</div> : null}

      <h3 className="admin-subtitle">Horario semanal</h3>
      <p className="admin-note">Cada día puede tener hasta dos bloques (mañana y tarde) de 30 minutos en adelante. Desactivá el día si el profesional no trabaja.</p>
      <div className="weekly-horarios">
        {DIAS.map(({ day, label }) => {
          const d = formularioSemanal[day];
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
        <button type="button" className="simple-submit" disabled={guardando} onClick={guardarSemanal}>{guardando ? 'Guardando...' : 'Guardar horario semanal'}</button>
        {!guardando && <button type="button" className="simple-submit secondary" onClick={() => { setFormularioSemanal(armarFormularioSemanal(profesionalHorario, horarioLaboral)); setAviso(null); }}>Descartar cambios</button>}
      </div>

      <h3 className="admin-subtitle">Bloqueos puntuales</h3>
      <p className="admin-note">Elegí un día y bloqueá horarios sueltos o tomate el día completo. Los bloqueos se guardan y no se pueden reservar.</p>
      <div className="admin-schedule-toolbar">
        <div className="admin-select-group">
          <label>Día</label>
          <input type="date" min={minIso} max={maxIso} value={fechaHorario} onChange={(e) => e.target.value && setFechaHorario(e.target.value)} />
        </div>
      </div>
      {cerrado ? (
        <p className="admin-note">Este día es domingo o lunes, la barbería está cerrada. Elegí un día de martes a sábado.</p>
      ) : (
        <>
          {diaTomado ? (
            <div className="admin-day-off">
              <p>Día tomado: todos los horarios están bloqueados.</p>
              <button type="button" className="simple-submit" onClick={toggleDia}>Desbloquear todo el día</button>
            </div>
          ) : (
            <button type="button" className="simple-submit" onClick={toggleDia}>Bloquear todo el día</button>
          )}
          <p className="admin-note">Tocá un horario para bloquearlo o liberarlo puntualmente.</p>
          <div className="chip-grid admin-hours-grid">
            {horariosDelDia.map((slot) => {
              const blocked = bloqueos.includes(slot);
              return <button key={slot} type="button" className={`simple-chip ${blocked ? 'occupied' : 'selected'}`} onClick={() => toggleSlot(slot)}>{slot}<small>{blocked ? 'Bloqueado' : 'Libre'}</small></button>;
            })}
          </div>
        </>
      )}
    </article>
  );
}
export default Horarios;