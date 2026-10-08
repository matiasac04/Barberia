// ═══════════════════════════════════════════════════════════════════
// MIS TURNOS (cliente) — pendientes, expirados, cancelar y reprogramar
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Pantalla del cliente para gestionar sus turnos. Se divide en:
// - Pendientes: próximos turnos. Permite cancelar o reprogramar SI
//   faltan > 24 hs (regla validada por sePuedeCancelar + backend).
// - Expirados: turnos que ya pasaron (estado lógico 'Expirado').
//
// FLUJO DE REPROGRAMACIÓN:
// 1. Cliente toca "Reprogramar" en un turno → setTurnoAReprogramar(id)
// 2. Abre panel con Calendario (rango hoy→+30). Al elegir día:
//    horariosLibresDelDia() calcula slots libres para ese barbero ese día
// 3. Elige nuevo horario (chip) → setHoraReprogramar
// 4. Confirma → onReprogramarTurno(id, nuevaFecha, nuevaHora) (App hace PATCH /turnos/:id)
// 5. Se cierra panel y se refrescan turnos/disponibilidad
//
// Regla de cancelación: sePuedeCancelar usa fechaHoraDelTurno + >24h.
// También backend la exige (no se puede burlar por API).
import { useState } from 'react';
import Calendario from './Calendario';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import { formatoCuentaRegresiva, horariosLibresDelDia, patronDelDia } from '../../utilidades/funciones';
const esDiaCerrado = (ds) => !patronDelDia(new Date(`${ds}T00:00:00`));
function MisTurnos({ calendarMax, calendarMin, sePuedeCancelar, currentUser, bloqueosPorFecha, turnosExpirados, horarioLaboral, onVolver, onCancelarTurno, onReprogramarTurno, turnosPendientes, turnosOcupados, horariosFijos }) {
  // ── Estado de reprogramación ──────────────────────
  // turnoAReprogramar: id del turno que se está reprogramando ('') = ninguno
  // fechaReprogramar: 'YYYY-MM-DD' elegido
  // horaReprogramar: 'HH:MM' elegido
  const [turnoAReprogramar, setTurnoAReprogramar] = useState('');
  const [fechaReprogramar, setFechaReprogramar] = useState('');
  const [horaReprogramar, setHoraReprogramar] = useState('');
  // ── Render de la pantalla ─────────────────────────
  return (
    <main className="simple-page">
      <Cabecera subtitle="Mis turnos" />
      <section className="simple-card client-topbar">
        <div><h2>Mis turnos</h2><p>Revisá tus turnos pendientes y los ya expirados.{currentUser ? ` Cuenta: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onVolver}>Volver al turnero</button>
      </section>
      <p className="bookings-note">Podés cancelar o reprogramar un turno pendiente siempre que falten más de 24 horas hasta la hora reservada.</p>
      <section className="simple-layout bookings-layout">
        <article className="simple-card bookings-panel">
          <div className="simple-section-head"><h2>Turnos pendientes</h2><span>{turnosPendientes.length}</span></div>
          {turnosPendientes.length > 0 ? (
            <div className="recent-list bookings-list">
              {turnosPendientes.map((b) => {
                const reprogramando = turnoAReprogramar === b.id;
                const horariosLibres = fechaReprogramar ? horariosLibresDelDia(turnosOcupados, b.idProfesional, fechaReprogramar, horariosFijos, bloqueosPorFecha, horarioLaboral) : [];
                return (
                  <div key={b.id} className="booking-item">
                    <div><strong>{b.nombreCliente}</strong><span>{b.nombreProfesional} · {b.nombreServicio} · {b.etiquetaDia} {b.fechaDia} · {b.hora}</span></div>
                    <span className="booking-countdown">{formatoCuentaRegresiva(b)}</span>
                    <div className="booking-actions">
                      {sePuedeCancelar(b) ? (
                        <>
                          <button type="button" className={`booking-rebook ${reprogramando ? 'active' : ''}`} onClick={() => { if (reprogramando) { setTurnoAReprogramar(''); setFechaReprogramar(''); setHoraReprogramar(''); } else { setTurnoAReprogramar(b.id); setFechaReprogramar(b.fecha); setHoraReprogramar(''); } }}>{reprogramando ? 'Cancelar reprogramación' : 'Reprogramar'}</button>
                          <button type="button" className="booking-cancel" onClick={() => onCancelarTurno(b.id)}>Cancelar turno</button>
                        </>
                      ) : <span className="booking-lock" title="Faltan menos de 24 horas hasta el turno; no se puede cancelar ni reprogramar">Bloqueado · menos de 24 hs</span>}
                    </div>
                    {reprogramando ? (
                      <div className="reschedule-panel">
                        <h4>Nueva fecha</h4>
                        <Calendario selectedDate={fechaReprogramar} onSelectDate={(ds) => { setFechaReprogramar(ds); setHoraReprogramar(''); }} minDate={calendarMin} maxDate={calendarMax} totalSlots={horariosFijos.length} getFreeCount={(ds) => (esDiaCerrado(ds) ? null : horariosLibresDelDia(turnosOcupados, b.idProfesional, ds, horariosFijos, bloqueosPorFecha, horarioLaboral).length)} />
                        <h4>Nuevo horario</h4>
                        {horariosLibres.length > 0 ? (
                          <div className="reschedule-slots">
                            {horariosLibres.map((s) => <button key={s} type="button" className={`simple-chip ${horaReprogramar === s ? 'selected' : ''}`} onClick={() => setHoraReprogramar(s)}>{s}</button>)}
                          </div>
                        ) : <p className="slots-empty">No quedan horarios libres para este profesional ese día. Probá otra fecha.</p>}
                        <button className="simple-submit reschedule-save" type="button" disabled={!horaReprogramar || (fechaReprogramar === b.fecha && horaReprogramar === b.hora)} onClick={() => { onReprogramarTurno(b.id, fechaReprogramar, horaReprogramar); setTurnoAReprogramar(''); setFechaReprogramar(''); setHoraReprogramar(''); }}>Confirmar reprogramación</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="bookings-empty">No tenés turnos pendientes. Reservá uno desde el turnero.</p>}
        </article>
        <article className="simple-card bookings-panel">
          <div className="simple-section-head"><h2>Turnos expirados</h2><span>{turnosExpirados.length}</span></div>
          {turnosExpirados.length > 0 ? (
            <div className="recent-list bookings-list">
              {turnosExpirados.map((b) => <div key={b.id}><strong>{b.nombreCliente}</strong><span>{b.nombreProfesional} · {b.nombreServicio} · {b.etiquetaDia} {b.fechaDia} · {b.hora}</span></div>)}
            </div>
          ) : <p className="bookings-empty">Los turnos que ya pasaron quedan guardados acá.</p>}
        </article>
      </section>
      <PieDePagina />
    </main>
  );
}
export default MisTurnos;