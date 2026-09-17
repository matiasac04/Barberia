// ── Turnos del cliente (pendientes, expirados, reprogramar) ──
import { useState } from 'react';
import Calendario from './Calendario';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import { formatCountdown, getDayFreeSlots, getWeekdayPattern } from '../../utilidades/ayudantes';
const isClosedDay = (ds) => !getWeekdayPattern(new Date(`${ds}T00:00:00`));
function MisTurnos({ calendarMax, calendarMin, canCancelBooking, currentUser, dateBlockouts, expiredBookings, horarioLaboral, onBack, onCancelBooking, onReschedule, pendingBookings, takenSlots, timeSlots }) {
  // ── Estado de reprogramación ──────────────────────
  const [rescheduleFor, setRescheduleFor] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleTime, setRescheduleTime] = useState('');
  // ── Render de la pantalla ─────────────────────────
  return (
    <main className="simple-page">
      <Cabecera subtitle="Mis turnos" />
      <section className="simple-card client-topbar">
        <div><h2>Mis turnos</h2><p>Revisá tus turnos pendientes y los ya expirados.{currentUser ? ` Cuenta: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onBack}>Volver al turnero</button>
      </section>
      <p className="bookings-note">Podés cancelar o reprogramar un turno pendiente siempre que falten más de 24 horas hasta la hora reservada.</p>
      <section className="simple-layout bookings-layout">
        <article className="simple-card bookings-panel">
          <div className="simple-section-head"><h2>Turnos pendientes</h2><span>{pendingBookings.length}</span></div>
          {pendingBookings.length > 0 ? (
            <div className="recent-list bookings-list">
              {pendingBookings.map((b) => {
                const isRescheduling = rescheduleFor === b.id;
                const freeSlots = rescheduleDate ? getDayFreeSlots(takenSlots, b.barberId, rescheduleDate, timeSlots, dateBlockouts, horarioLaboral) : [];
                return (
                  <div key={b.id} className="booking-item">
                    <div><strong>{b.customerName}</strong><span>{b.barberName} · {b.serviceName} · {b.dayLabel} {b.dayDate} · {b.time}</span></div>
                    <span className="booking-countdown">{formatCountdown(b)}</span>
                    <div className="booking-actions">
                      {canCancelBooking(b) ? (
                        <>
                          <button type="button" className={`booking-rebook ${isRescheduling ? 'active' : ''}`} onClick={() => { if (isRescheduling) { setRescheduleFor(''); setRescheduleDate(''); setRescheduleTime(''); } else { setRescheduleFor(b.id); setRescheduleDate(b.bookingDate); setRescheduleTime(''); } }}>{isRescheduling ? 'Cancelar reprogramación' : 'Reprogramar'}</button>
                          <button type="button" className="booking-cancel" onClick={() => onCancelBooking(b.id)}>Cancelar turno</button>
                        </>
                      ) : <span className="booking-lock" title="Faltan menos de 24 horas hasta el turno; no se puede cancelar ni reprogramar">Bloqueado · menos de 24 hs</span>}
                    </div>
                    {isRescheduling ? (
                      <div className="reschedule-panel">
                        <h4>Nueva fecha</h4>
                        <Calendario selectedDate={rescheduleDate} onSelectDate={(ds) => { setRescheduleDate(ds); setRescheduleTime(''); }} minDate={calendarMin} maxDate={calendarMax} totalSlots={timeSlots.length} getFreeCount={(ds) => (isClosedDay(ds) ? null : getDayFreeSlots(takenSlots, b.barberId, ds, timeSlots, dateBlockouts, horarioLaboral).length)} />
                        <h4>Nuevo horario</h4>
                        {freeSlots.length > 0 ? (
                          <div className="reschedule-slots">
                            {freeSlots.map((s) => <button key={s} type="button" className={`simple-chip ${rescheduleTime === s ? 'selected' : ''}`} onClick={() => setRescheduleTime(s)}>{s}</button>)}
                          </div>
                        ) : <p className="slots-empty">No quedan horarios libres para este profesional ese día. Probá otra fecha.</p>}
                        <button className="simple-submit reschedule-save" type="button" disabled={!rescheduleTime || (rescheduleDate === b.bookingDate && rescheduleTime === b.time)} onClick={() => { onReschedule(b.id, rescheduleDate, rescheduleTime); setRescheduleFor(''); setRescheduleDate(''); setRescheduleTime(''); }}>Confirmar reprogramación</button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : <p className="bookings-empty">No tenés turnos pendientes. Reservá uno desde el turnero.</p>}
        </article>
        <article className="simple-card bookings-panel">
          <div className="simple-section-head"><h2>Turnos expirados</h2><span>{expiredBookings.length}</span></div>
          {expiredBookings.length > 0 ? (
            <div className="recent-list bookings-list">
              {expiredBookings.map((b) => <div key={b.id}><strong>{b.customerName}</strong><span>{b.barberName} · {b.serviceName} · {b.dayLabel} {b.dayDate} · {b.time}</span></div>)}
            </div>
          ) : <p className="bookings-empty">Los turnos que ya pasaron quedan guardados acá.</p>}
        </article>
      </section>
      <PieDePagina />
    </main>
  );
}
export default MisTurnos;
