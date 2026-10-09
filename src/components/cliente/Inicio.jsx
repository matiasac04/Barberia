// ═══════════════════════════════════════════════════════════════════
// TURNERO DEL CLIENTE — reserva de turnos en 5 pasos (asistente)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Pantalla principal del cliente. Presenta la reserva como un ASISTENTE de
// 5 pasos navegables (también visibles todos juntos en desktop):
//   Paso 1: Elegí servicio   (chips con nombre, duración y precio)
//   Paso 2: Elegí día        (Calendario mensual con horarios libres por día)
//   Paso 3: Elegí barbero    (chips con avatar de iniciales + libres)
//   Paso 4: Elegí horario    (horarios del día; los ocupados van 'disabled')
//   Paso 5: Completá datos y confirmá (nombre + teléfono → registrarTurno)
//
// pasoActual controla cuál panel está activo en mobile (desktop muestra
// todos vía CSS). BarraPasos dibuja botones Volver/Siguiente.
//
// La disponibilidad la calcula App.jsx (horariosLibres, horariosNoDisponibles,
// horariosDelDia) y la PASA ya filtrada; este componente solo la pinta y maneja
// el estado del asistente. registrarTurno (App.jsx) revalida y llama POST /turnos.
//
// Reglas: domingos/lunes cerrados, ventana hoy→+30 días.
import { useEffect, useState } from 'react';
import Calendario from './Calendario';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import { horariosLibresDelDia, patronDelDia } from '../../utilidades/funciones';
// iniciales: saca las iniciales del nombre (ej. "Juan Pérez" → "JP")
const iniciales = (name) => name.split(' ').filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
// esDiaCerrado: true si es domingo/lunes (patronDelDia devuelve null)
const esDiaCerrado = (ds) => !patronDelDia(new Date(`${ds}T00:00:00`));
// Lee el paso del asistente desde el hash (#paso-N). Fuera de 1..5, cae en 1.
const leerPasoDesdeHash = () => {
  const m = window.location.hash.match(/^#paso-(\d)$/);
  const n = m ? Number(m[1]) : 1;
  return n >= 1 && n <= 5 ? n : 1;
};
// BarraPasos: barra de navegación del asistente (botones Volver / Siguiente)
function BarraPasos({ onPrev, onNext }) {
  return (
    <div className="step-nav">
      {onPrev && <button type="button" className="step-nav-btn prev" onClick={onPrev}>Volver</button>}
      {onNext && <button type="button" className="step-nav-btn next" onClick={onNext}>Siguiente</button>}
    </div>
  );
}
function Inicio({ horariosLibres, profesionales, profesionalActual, servicioActual, diaActual, currentUser, nombreCliente, telefonoCliente, bloqueosPorFecha, diaCalendarMax, diaCalendarMin, horariosDelDia, aviso, registrarTurno, cargandoDisponibilidad, proximosTurnos, cantidadOcupados, onCerrarSesion, onVerMisTurnos, horarioLaboral, profesionalSeleccionado, fechaSeleccionada, servicioSeleccionado, horaSeleccionada, horaEstaOcupada, servicios, setNombreCliente, setTelefonoCliente, setProfesionalSeleccionado, setFechaSeleccionada, setServicioSeleccionado, setHoraSeleccionada, enviando, horariosFijos, turnosOcupados, horariosNoDisponibles }) {
  // ── Estado del asistente móvil ──────────────────────
  const [pasoActual, setPasoActual] = useState(leerPasoDesdeHash);
  const [infoVisible, setInfoVisible] = useState(false);
  // ── Historial del asistente ────────────────────────
  // Sincroniza el paso activo con el hash (#paso-N) para que el botón
  // atrás/adelante del navegador navegue entre pasos y no salga de la app.
  useEffect(() => {
    const inicial = leerPasoDesdeHash();
    try { history.replaceState({ paso: inicial }, '', `#paso-${inicial}`); } catch {}
    const onPop = () => setPasoActual(leerPasoDesdeHash());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const irAlPaso = (n) => {
    if (n === pasoActual) return;
    setPasoActual(n);
    try { history.pushState({ paso: n }, '', `#paso-${n}`); } catch {}
  };
  // ── Lógica derivada del día y profesionales ────────
  if (!profesionalActual || !servicioActual) return null;
  const diaCerrado = diaActual.id === 'dom';
  const cantidadLibres = (bid) => (diaCerrado ? 0 : horariosLibresDelDia(turnosOcupados, bid, fechaSeleccionada, horariosFijos, bloqueosPorFecha, horarioLaboral).length);
  // ── Render de la pantalla ─────────────────────────
  return (
    <main className="simple-page">
      <Cabecera />
      <section className="simple-card client-topbar">
        <div><h2>Turnero del cliente</h2><p>Reservá en pocos pasos y gestioná tus turnos cuando quieras.{currentUser ? ` Sesión activa: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onCerrarSesion}>Cerrar sesión</button>
        <button type="button" className="client-secondary-action" onClick={onVerMisTurnos}>Ver mis turnos</button>
      </section>
      <section className="simple-layout">
        <article className="simple-card">
          <div className="info-head">
            <h2>Cómo funciona</h2>
            <button type="button" className="info-toggle" aria-expanded={infoVisible} onClick={() => setInfoVisible((v) => !v)}>{infoVisible ? 'Ver menos' : 'Ver más'}</button>
          </div>
          <div className={`info-body${infoVisible ? ' open' : ''}`}>
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
              {proximosTurnos[0] ? <p>{proximosTurnos[0].nombreCliente} con {proximosTurnos[0].nombreProfesional} el {proximosTurnos[0].etiquetaDia} a las {proximosTurnos[0].hora}.</p> : <p>Aún no hay reservas confirmadas.</p>}
            </div>
          </div>
        </article>
        <article className="simple-card">
          <div className="simple-section-head">
            <h2>Reservar turno</h2>
            <span>{horariosLibres.length === 0 ? 'Sin horarios libres' : `${horariosLibres.length} horarios libres`}</span>
          </div>
          <div className="step-progress" aria-hidden="true">
            <span className="step-progress-label">Paso {pasoActual} de 5</span>
            <span className="step-progress-bar"><i style={{ width: `${(pasoActual / 5) * 100}%` }} /></span>
          </div>
          {aviso.type !== 'success' && <div className={`simple-feedback ${aviso.type}`}>{aviso.message}</div>}
          <div className={`simple-group step-panel${pasoActual === 1 ? ' is-active' : ''}`} data-step="1">
            <div className="step-label"><span className="step-badge">1</span><label>Elegí el servicio</label></div>
            <div className="chip-grid service-grid">
              {servicios.map((s) => (
                <button key={s.id} type="button" aria-pressed={servicioSeleccionado === s.id} className={`simple-chip ${servicioSeleccionado === s.id ? 'selected' : ''}`} onClick={() => setServicioSeleccionado(s.id)}>
                  <span>{s.name}{s.durationMinutes ? ` · ${s.durationMinutes} min` : ''}</span>
                  <strong>${s.price.toLocaleString('es-AR')}</strong>
                </button>
              ))}
            </div>
            <BarraPasos onNext={() => irAlPaso(2)} />
          </div>
          <div className={`simple-group step-panel${pasoActual === 2 ? ' is-active' : ''}`} data-step="2">
            <div className="step-label"><span className="step-badge">2</span><label>Elegí el día</label></div>
            <Calendario selectedDate={fechaSeleccionada} onSelectDate={setFechaSeleccionada} minDate={diaCalendarMin} maxDate={diaCalendarMax} totalSlots={horariosDelDia.length} getFreeCount={(ds) => (esDiaCerrado(ds) ? null : horariosLibresDelDia(turnosOcupados, profesionalSeleccionado, ds, horariosFijos, bloqueosPorFecha, horarioLaboral).length)} />
            <p className="calendar-hint">Cada día muestra cuántos horarios quedan libres. Los domingos y lunes están cerrados.</p>
            <BarraPasos onPrev={() => irAlPaso(1)} onNext={() => irAlPaso(3)} />
          </div>
          <div className={`simple-group step-panel${pasoActual === 3 ? ' is-active' : ''}`} data-step="3">
            <div className="step-label"><span className="step-badge">3</span><label>Elegí el barbero</label></div>
            <div className="chip-grid">
              {profesionales.map((b) => (
                <button key={b.id} type="button" aria-pressed={profesionalSeleccionado === b.id} className={`simple-chip barber-chip ${profesionalSeleccionado === b.id ? 'selected' : ''}`} onClick={() => setProfesionalSeleccionado(b.id)}>
                  <span className="avatar">{iniciales(b.name)}</span>
                  <span className="barber-chip-text"><strong>{b.name}</strong><small>{diaCerrado ? 'Cerrado hoy' : `${cantidadLibres(b.id)} horarios libres`}</small></span>
                </button>
              ))}
            </div>
            <BarraPasos onPrev={() => irAlPaso(2)} onNext={() => irAlPaso(4)} />
          </div>
          <div className={`simple-group step-panel${pasoActual === 4 ? ' is-active' : ''}`} data-step="4">
            <div className="step-label"><span className="step-badge">4</span><label>Elegí el horario</label></div>
            {diaCerrado ? (
              <p className="slots-empty">Domingos y lunes estamos cerrados. Elegí un día de martes a sábado para reservar.</p>
            ) : horariosLibres.length === 0 ? (
              <p className="slots-empty">No quedan horarios libres para {profesionalActual.name} ese día. Probá otra fecha o cambiá de profesional.</p>
            ) : (
              <>
                <div className="chip-grid hours-grid">
                  {horariosDelDia.map((slot) => {
                    const taken = horariosNoDisponibles.includes(slot);
                    return <button key={slot} type="button" aria-pressed={horaSeleccionada === slot} className={`simple-chip ${horaSeleccionada === slot ? 'selected' : ''} ${taken ? 'occupied' : ''}`} disabled={taken || cargandoDisponibilidad} onClick={() => setHoraSeleccionada(slot)}>{slot}</button>;
                  })}
                </div>
                {cargandoDisponibilidad ? <p className="hours-hint">Cargando disponibilidad...</p> : <p className="hours-hint">Los horarios tachados ya están ocupados para {profesionalActual.name} ese día.</p>}
              </>
            )}
            <BarraPasos onPrev={() => irAlPaso(3)} onNext={() => irAlPaso(5)} />
          </div>
          <div className={`simple-group step-panel${pasoActual === 5 ? ' is-active' : ''}`} data-step="5">
            <div className="step-label"><span className="step-badge">5</span><label>Completá tus datos y confirmá</label></div>
            <form className="simple-form" onSubmit={registrarTurno}>
              <input type="text" placeholder="Nombre y apellido" value={nombreCliente} onChange={(e) => setNombreCliente(e.target.value)} />
              <input type="tel" placeholder="Celular (ej. 11 5555-1234)" value={telefonoCliente} onChange={(e) => setTelefonoCliente(e.target.value)} />
              <button className="simple-submit" type="submit" disabled={enviando}>{enviando ? 'Confirmando...' : 'Confirmar turno'}</button>
              {aviso.type === 'success' && <div className={`simple-feedback ${aviso.type}`}>{aviso.message}</div>}
            </form>
            <BarraPasos onPrev={() => irAlPaso(4)} />
          </div>
        </article>
        <article className="simple-card">
          <div className="simple-section-head">
            <h2>Resumen de tu turno</h2>
            <span>{!horaSeleccionada ? 'Sin elegir' : horaEstaOcupada ? 'Ocupado' : 'Disponible'}</span>
          </div>
          <ul className="simple-summary-list">
            <li><strong>Barbero:</strong><span>{profesionalActual.name}</span></li>
            <li><strong>Fecha:</strong><span>{diaActual.label} · {diaActual.date}</span></li>
            <li><strong>Horario:</strong><span>{horaSeleccionada || 'Sin seleccionar'}</span></li>
            <li><strong>Servicio:</strong><span>{servicioActual.name}{servicioActual.durationMinutes ? ` · ${servicioActual.durationMinutes} min` : ''} · ${servicioActual.price.toLocaleString('es-AR')}</span></li>
            <li className="summary-total"><strong>Total:</strong><span>${servicioActual.price.toLocaleString('es-AR')}</span></li>
          </ul>
          <div className="simple-summary-box">
            <h3>Tus próximos turnos</h3>
            {proximosTurnos.length > 0 ? (
              <div className="recent-list">
                {proximosTurnos.map((b) => <div key={b.id}><strong>{b.nombreCliente}</strong><span>{b.nombreProfesional} · {b.nombreServicio} · {b.etiquetaDia} {b.hora}</span></div>)}
              </div>
            ) : <p>No tenés turnos próximos todavía.</p>}
          </div>
          <div className="stats-row">
            <div><strong>{proximosTurnos.length}</strong><span>Próximos</span></div>
            <div><strong>{cantidadOcupados}</strong><span>Horas ocupadas hoy</span></div>
          </div>
        </article>
      </section>
      <PieDePagina />
    </main>
  );
}
export default Inicio;