// ── Turnero del cliente (reserva de turnos en 5 pasos) ─
import { useState } from 'react';
import Calendario from './Calendario';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import { getDayFreeSlots, getWeekdayPattern } from '../../utilidades/ayudantes';
const avatarInitials = (name) => name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const isClosedDay = (ds) => !getWeekdayPattern(new Date(`${ds}T00:00:00`));
function StepNav({ onPrev, onNext }) {
  return (
    <div className="step-nav">
      {onPrev && <button type="button" className="step-nav-btn prev" onClick={onPrev}>Volver</button>}
      {onNext && <button type="button" className="step-nav-btn next" onClick={onNext}>Siguiente</button>}
    </div>
  );
}
function Inicio({ availableSlots, barbers, currentBarber, currentService, currentDay, currentUser, customerName, customerPhone, dateBlockouts, dayCalendarMax, dayCalendarMin, daySlots, feedback, handleSubmit, loadingAvailability, nextBookings, occupancyCount, onLogout, onShowMyBookings, horarioLaboral, selectedBarber, selectedDate, selectedService, selectedTime, selectedTimeIsTaken, services, setCustomerName, setCustomerPhone, setSelectedBarber, setSelectedDate, setSelectedService, setSelectedTime, submitting, takenSlots, timeSlots, unavailableSlots }) {
  // ── Estado del wizard móvil ─────────────────────────
  const [activeStep, setActiveStep] = useState(1);
  const [infoAbierto, setInfoAbierto] = useState(false);
  // ── Lógica derivada del día y profesionales ────────
  if (!currentBarber || !currentService) return null;
  const dayIsClosed = currentDay.id === 'sun';
  const barberFreeCount = (bid) => (dayIsClosed ? 0 : getDayFreeSlots(takenSlots, bid, selectedDate, timeSlots, dateBlockouts, horarioLaboral).length);
  // ── Render de la pantalla ─────────────────────────
  return (
    <main className="simple-page">
      <Cabecera />
      <section className="simple-card client-topbar">
        <div><h2>Turnero del cliente</h2><p>Reservá en pocos pasos y gestioná tus turnos cuando quieras.{currentUser ? ` Sesión activa: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onLogout}>Cerrar sesión</button>
        <button type="button" className="client-secondary-action" onClick={onShowMyBookings}>Ver mis turnos</button>
      </section>
      <section className="simple-layout">
        <article className="simple-card">
          <div className="info-head">
            <h2>Cómo funciona</h2>
            <button type="button" className="info-toggle" aria-expanded={infoAbierto} onClick={() => setInfoAbierto((v) => !v)}>{infoAbierto ? 'Ver menos' : 'Ver más'}</button>
          </div>
          <div className={`info-body${infoAbierto ? ' open' : ''}`}>
            <div className="step-list">
              <div><strong>1.</strong><span>Elegí el servicio.</span></div>
              <div><strong>2.</strong><span>Elegí el día.</span></div>
              <div><strong>3.</strong><span>Elegí tu barbero.</span></div>
              <div><strong>4.</strong><span>Tocá un horario libre.</span></div>
              <div><strong>5.</strong><span>Completá tus datos y confirmá.</span></div>
            </div>
            <p className="calendar-hint">Abrimos de martes a sábado. Domingos y lunes no trabajamos. Podés reservar con hasta 30 días de anticipación.</p>
            <div className="simple-summary-box">
              <h3>El local</h3>
              <p><a href="https://www.google.com/maps/search/?api=1&query=Av.+Pellegrini+1234+Rosario+Santa+Fe" target="_blank" rel="noopener noreferrer">Av. Pellegrini 1234 · Rosario, Santa Fe</a></p>
              <p>WhatsApp: 341 555-0000</p>
              <p>Mar a Sáb · 9:00 a 12:00 y 15:00 a 17:00</p>
              <p><a className="local-link" href="https://instagram.com/barberia" target="_blank" rel="noopener noreferrer">Instagram: @barberia</a></p>
              <iframe className="local-map" src="https://maps.google.com/maps?q=Av.%20Pellegrini%201234%2C%20Rosario%2C%20Santa%20Fe&z=15&output=embed" title="Mapa de la barbería" loading="lazy" allowFullScreen referrerPolicy="no-referrer-when-downgrade" />
            </div>
            <div className="simple-summary-box">
              <h3>Último turno confirmado</h3>
              {nextBookings[0] ? <p>{nextBookings[0].customerName} con {nextBookings[0].barberName} el {nextBookings[0].dayLabel} a las {nextBookings[0].time}.</p> : <p>Aún no hay reservas confirmadas.</p>}
            </div>
          </div>
        </article>
        <article className="simple-card">
          <div className="simple-section-head">
            <h2>Reservar turno</h2>
            <span>{availableSlots.length === 0 ? 'Sin horarios libres' : `${availableSlots.length} horarios libres`}</span>
          </div>
          <div className="step-progress" aria-hidden="true">
            <span className="step-progress-label">Paso {activeStep} de 5</span>
            <span className="step-progress-bar"><i style={{ width: `${(activeStep / 5) * 100}%` }} /></span>
          </div>
          <div className={`simple-feedback ${feedback.type}`}>{feedback.message}</div>
          <div className={`simple-group step-panel${activeStep === 1 ? ' is-active' : ''}`} data-step="1">
            <div className="step-label"><span className="step-badge">1</span><label>Elegí el servicio</label></div>
            <div className="chip-grid service-grid">
              {services.map((s) => (
                <button key={s.id} type="button" aria-pressed={selectedService === s.id} className={`simple-chip ${selectedService === s.id ? 'selected' : ''}`} onClick={() => setSelectedService(s.id)}>
                  <span>{s.name}{s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}</span>
                  <strong>${s.price.toLocaleString('es-AR')}</strong>
                </button>
              ))}
            </div>
            <StepNav onNext={() => setActiveStep(2)} />
          </div>
          <div className={`simple-group step-panel${activeStep === 2 ? ' is-active' : ''}`} data-step="2">
            <div className="step-label"><span className="step-badge">2</span><label>Elegí el día</label></div>
            <Calendario selectedDate={selectedDate} onSelectDate={setSelectedDate} minDate={dayCalendarMin} maxDate={dayCalendarMax} totalSlots={daySlots.length} getFreeCount={(ds) => (isClosedDay(ds) ? null : getDayFreeSlots(takenSlots, selectedBarber, ds, timeSlots, dateBlockouts, horarioLaboral).length)} />
            <p className="calendar-hint">Cada día muestra cuántos horarios quedan libres. Los domingos y lunes están cerrados.</p>
            <StepNav onPrev={() => setActiveStep(1)} onNext={() => setActiveStep(3)} />
          </div>
          <div className={`simple-group step-panel${activeStep === 3 ? ' is-active' : ''}`} data-step="3">
            <div className="step-label"><span className="step-badge">3</span><label>Elegí el barbero</label></div>
            <div className="chip-grid">
              {barbers.map((b) => (
                <button key={b.id} type="button" aria-pressed={selectedBarber === b.id} className={`simple-chip barber-chip ${selectedBarber === b.id ? 'selected' : ''}`} onClick={() => setSelectedBarber(b.id)}>
                  <span className="avatar">{avatarInitials(b.name)}</span>
                  <span className="barber-chip-text"><strong>{b.name}</strong><small>{dayIsClosed ? 'Cerrado hoy' : `${barberFreeCount(b.id)} horarios libres`}</small></span>
                </button>
              ))}
            </div>
            <StepNav onPrev={() => setActiveStep(2)} onNext={() => setActiveStep(4)} />
          </div>
          <div className={`simple-group step-panel${activeStep === 4 ? ' is-active' : ''}`} data-step="4">
            <div className="step-label"><span className="step-badge">4</span><label>Elegí el horario</label></div>
            {dayIsClosed ? (
              <p className="slots-empty">Domingos y lunes estamos cerrados. Elegí un día de martes a sábado para reservar.</p>
            ) : availableSlots.length === 0 ? (
              <p className="slots-empty">No quedan horarios libres para {currentBarber.name} ese día. Probá otra fecha o cambiá de profesional.</p>
            ) : (
              <>
                <div className="chip-grid hours-grid">
                  {daySlots.map((slot) => {
                    const taken = unavailableSlots.includes(slot);
                    return <button key={slot} type="button" aria-pressed={selectedTime === slot} className={`simple-chip ${selectedTime === slot ? 'selected' : ''} ${taken ? 'occupied' : ''}`} disabled={taken || loadingAvailability} onClick={() => setSelectedTime(slot)}>{slot}</button>;
                  })}
                </div>
                {loadingAvailability ? <p className="hours-hint">Cargando disponibilidad...</p> : <p className="hours-hint">Los horarios tachados ya están ocupados para {currentBarber.name} ese día.</p>}
              </>
            )}
            <StepNav onPrev={() => setActiveStep(3)} onNext={() => setActiveStep(5)} />
          </div>
          <div className={`simple-group step-panel${activeStep === 5 ? ' is-active' : ''}`} data-step="5">
            <div className="step-label"><span className="step-badge">5</span><label>Completá tus datos y confirmá</label></div>
            <form className="simple-form" onSubmit={handleSubmit}>
              <input type="text" placeholder="Nombre y apellido" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <input type="tel" placeholder="Celular (ej. 11 5555-1234)" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
              <button className="simple-submit" type="submit" disabled={submitting}>{submitting ? 'Confirmando...' : 'Confirmar turno'}</button>
            </form>
            <StepNav onPrev={() => setActiveStep(4)} />
          </div>
        </article>
        <article className="simple-card">
          <div className="simple-section-head">
            <h2>Resumen de tu turno</h2>
            <span>{!selectedTime ? 'Sin elegir' : selectedTimeIsTaken ? 'Ocupado' : 'Disponible'}</span>
          </div>
          <ul className="simple-summary-list">
            <li><strong>Barbero:</strong><span>{currentBarber.name}</span></li>
            <li><strong>Fecha:</strong><span>{currentDay.label} · {currentDay.date}</span></li>
            <li><strong>Horario:</strong><span>{selectedTime || 'Sin seleccionar'}</span></li>
            <li><strong>Servicio:</strong><span>{currentService.name}{currentService.durationMinutes ? ` · ${currentService.durationMinutes} min` : ''} · ${currentService.price.toLocaleString('es-AR')}</span></li>
            <li className="summary-total"><strong>Total:</strong><span>${currentService.price.toLocaleString('es-AR')}</span></li>
          </ul>
          <div className="simple-summary-box">
            <h3>Tus próximos turnos</h3>
            {nextBookings.length > 0 ? (
              <div className="recent-list">
                {nextBookings.map((b) => <div key={b.id}><strong>{b.customerName}</strong><span>{b.barberName} · {b.serviceName} · {b.dayLabel} {b.time}</span></div>)}
              </div>
            ) : <p>No tenés turnos próximos todavía.</p>}
          </div>
          <div className="stats-row">
            <div><strong>{nextBookings.length}</strong><span>Próximos</span></div>
            <div><strong>{occupancyCount}</strong><span>Horas ocupadas hoy</span></div>
          </div>
        </article>
      </section>
      <PieDePagina />
    </main>
  );
}
export default Inicio;