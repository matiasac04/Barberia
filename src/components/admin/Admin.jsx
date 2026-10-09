// ═══════════════════════════════════════════════════════════════════
// PANEL DE ADMINISTRACIÓN — orquestador de pestañas
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es el "shell" del admin. No hace llamadas a la API directamente: recibe
// de App.jsx los datos (turnos, profesionales, servicios, horarios, bloqueos)
// y los HANDLERS CRUD ya listos (onRegistrarProfesional, onEditarTurno, etc.).
//
// Su trabajo es:
// 1. Manejar la navegación entre 6 PESTAÑAS (pestanaActiva):
//    Resumen · Profesionales · Servicios · Horarios · Turnos · Agenda
// 2. Manejar el ESTADO DE LOS FORMULARIOS (alta/edición de profesional,
//    servicio y turno) —incluido qué registro se está editando (form.id)
// 3. DERIVAR datos: conteo de turnos por estado (conteoEstados) para las
//    tarjetas del resumen. La agenda se agrupa dentro de su propio panel.
// 4. Delegar el render a cada panel, pasándole datos y handlers.
//
// Si el usuario cambia de profesional/turno, se reselecciona el primero
// válido (useEffects) para no dejar forms apuntando a algo inexistente.
import { useEffect, useMemo, useState } from 'react';
import { fechaAIso } from '../../utilidades/funciones';
import Agenda from './Agenda';
import Turnos from './Turnos';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import Resumen from './Resumen';
import Profesionales from './Profesionales';
import Horarios from './Horarios';
import Servicios from './Servicios';

// ── Constantes de formularios y opciones ──────────────
// Etiquetas de estados (para mostrar en listas) y su clase CSS
// opcionesEstado alimenta el <select> del formulario de turno.
//
// OJO: NO existe un estado 'confirmed' ni valores en inglés. El backend ya
// guarda el estado en español (Confirmado/Completado/NoSePresento/Cancelado)
// y estadoDelTurno (funciones.js) agrega 'Expirado' cuando la hora pasó.
// Antes había estados tipo 'pending'/'no-show' que se traducían a mano y la
// tarjeta "Confirmado" del Resumen mostraba siempre 0.
const etiquetasEstado = { Confirmado: 'Confirmado', Completado: 'Completado', NoSePresento: 'No se presentó', Cancelado: 'Cancelado', Expirado: 'Expirado' };
const clasesEstado = { Confirmado: 'status-confirmed', Completado: 'status-completed', NoSePresento: 'status-no-show', Cancelado: 'status-cancelled', Expirado: 'status-cancelled' };
const opcionesEstado = [
  { value: 'Confirmado', label: 'Confirmado' },
  { value: 'Completado', label: 'Completado' },
  { value: 'NoSePresento', label: 'No se presentó' },
  { value: 'Cancelado', label: 'Cancelado' },
];
const opcionesPestana = [
  { id: 'resumen', label: 'Resumen' }, { id: 'profesionales', label: 'Profesionales' }, { id: 'servicios', label: 'Servicios' },
  { id: 'horarios', label: 'Horarios' }, { id: 'turnos', label: 'Turnos' }, { id: 'agenda', label: 'Agenda' },
];
const profesionalVacio = { id: '', name: '', email: '', telefono: '' };
const servicioVacio = { id: '', name: '', price: '', duracion: '' };
const crearFormularioTurno = (b) => ({
  nombreCliente: b?.nombreCliente ?? '', telefonoCliente: b?.telefonoCliente ?? '', idProfesional: b?.idProfesional ?? '',
  idServicio: b?.idServicio ?? '', fecha: b?.fecha ?? '', hora: b?.hora ?? '', estado: b?.estado ?? 'Confirmado',
});

function Admin({ todosProfesionales, profesionales, turnos, currentUser, bloqueosPorFecha, errorCarga, horarioLaboral, onRegistrarProfesional, onRegistrarServicio, onBorrarProfesional, onBorrarTurno, onBorrarServicio, onCerrarSesion, onGuardarBloqueos, onGuardarHorarios, onCambiarActivoProfesional, onEditarProfesional, onEditarTurno, onEditarServicio, servicios, horariosFijos }) {
  // ── Estado de formularios y selección ─────────────
  const [pestanaActiva, setPestanaActiva] = useState('resumen');
  const [formularioProfesional, setFormularioProfesional] = useState(profesionalVacio);
  const [formularioServicio, setFormularioServicio] = useState(servicioVacio);
  const [profesionalHorario, setProfesionalHorario] = useState(profesionales[0]?.id ?? '');
  const [fechaHorario, setFechaHorario] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return fechaAIso(d); });
  const [turnoSeleccionadoId, setTurnoSeleccionadoId] = useState(turnos[0]?.id ?? '');
  const [formularioTurno, setFormularioTurno] = useState(crearFormularioTurno(turnos[0]));
  const [aviso, setAviso] = useState({ type: 'idle', message: 'Administrá profesionales, servicios, horarios y turnos desde aquí.' });
  useEffect(() => { if (profesionales.length === 0) { setProfesionalHorario(''); return; } if (!profesionales.some((b) => String(b.id) === String(profesionalHorario))) setProfesionalHorario(profesionales[0].id); }, [profesionales, profesionalHorario]);
  useEffect(() => { if (turnos.length === 0) { setTurnoSeleccionadoId(''); setFormularioTurno(crearFormularioTurno()); return; } const sel = turnos.find((b) => b.id === turnoSeleccionadoId) ?? turnos[0]; setTurnoSeleccionadoId(sel.id); setFormularioTurno(crearFormularioTurno(sel)); }, [turnos, turnoSeleccionadoId]);
  // ── Datos derivados (conteo por estado) ───────────
  const conteoEstados = useMemo(() => turnos.reduce((a, b) => { a[b.estado] = (a[b.estado] ?? 0) + 1; return a; }, { Confirmado: 0, Completado: 0, NoSePresento: 0, Cancelado: 0, Expirado: 0 }), [turnos]);
  // ── Handlers de formularios ───────────────────────
  const guardarProfesional = async (e) => {
    e.preventDefault();
    if (!formularioProfesional.name.trim()) { setAviso({ type: 'error', message: 'Escribí un nombre para guardar el profesional.' }); return; }
    let res;
    if (formularioProfesional.id) { res = await onEditarProfesional(formularioProfesional.id, formularioProfesional.name.trim(), formularioProfesional.email, formularioProfesional.telefono); setAviso(res.ok ? { type: 'success', message: 'Profesional actualizado.' } : { type: 'error', message: res.error || 'No se pudo actualizar el profesional.' }); }
    else { res = await onRegistrarProfesional(formularioProfesional.name.trim(), formularioProfesional.email, formularioProfesional.telefono); setAviso(res.ok ? { type: 'success', message: 'Profesional agregado.' } : { type: 'error', message: res.error || 'No se pudo agregar el profesional.' }); }
    if (res.ok) setFormularioProfesional(profesionalVacio);
  };
  const confirmarBorradoProfesional = async (id) => { const res = await onBorrarProfesional(id); if (res.ok) setFormularioProfesional(profesionalVacio); else if (res.error) setAviso({ type: 'error', message: res.error }); };
  const guardarServicio = async (e) => {
    e.preventDefault();
    const pv = Number(formularioServicio.price);
    const dv = Number(formularioServicio.duracion);
    if (!formularioServicio.name.trim() || Number.isNaN(pv) || pv <= 0) { setAviso({ type: 'error', message: 'Completá nombre y precio válido para guardar el servicio.' }); return; }
    if (Number.isNaN(dv) || dv <= 0) { setAviso({ type: 'error', message: 'Completá una duración válida (en minutos) para guardar el servicio.' }); return; }
    let ok;
    if (formularioServicio.id) { ok = await onEditarServicio(formularioServicio.id, formularioServicio.name.trim(), pv, dv); if (ok) setAviso({ type: 'success', message: 'Servicio actualizado.' }); }
    else { ok = await onRegistrarServicio(formularioServicio.name.trim(), pv, dv); if (ok) setAviso({ type: 'success', message: 'Servicio agregado.' }); }
    if (ok) setFormularioServicio(servicioVacio);
  };
  const confirmarBorradoServicio = async (s) => { if (await onBorrarServicio(s.id)) setFormularioServicio(servicioVacio); };
  const guardarTurno = async (e) => {
    e.preventDefault();
    if (!turnoSeleccionadoId) { setAviso({ type: 'error', message: 'No hay un turno seleccionado para editar.' }); return; }
    if (!formularioTurno.nombreCliente.trim() || !formularioTurno.telefonoCliente.trim()) { setAviso({ type: 'error', message: 'Completá nombre y celular del turno.' }); return; }
    const ok = await onEditarTurno(turnoSeleccionadoId, formularioTurno);
    setAviso(ok ? { type: 'success', message: 'Turno actualizado en la base de datos.' } : { type: 'error', message: 'No se pudo actualizar el turno. Revisá la conexión y que la sesión siga activa.' });
  };
  // ── Render del panel ──────────────────────────────
  const turnoSeleccionado = turnos.find((b) => b.id === turnoSeleccionadoId) ?? turnos[0] ?? null;
  const cargarProfesionalEnForm = (b) => setFormularioProfesional({ id: b.id, name: b.name, email: b.email ?? '', telefono: b.telefono ?? '' });
  const cargarServicioEnForm = (s) => setFormularioServicio({ id: s.id, name: s.name, price: String(s.price), duracion: s.durationMinutes != null ? String(s.durationMinutes) : '' });
  const cargarTurnoEnForm = (b) => { setTurnoSeleccionadoId(b.id); setFormularioTurno(crearFormularioTurno(b)); };
  return (
    <main className="simple-page admin-page">
      <Cabecera subtitle="Panel administrativo" />
      <section className="simple-card client-topbar admin-topbar">
        <div><h2>Panel de administración</h2><p>Controlá la operación de la barbería.{currentUser ? ` Sesión activa: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onCerrarSesion}>Cerrar sesión</button>
      </section>
      <section className="simple-card admin-summary">
        <div><strong>{profesionales.length}</strong><span>Profesionales</span></div>
        <div><strong>{servicios.length}</strong><span>Servicios</span></div>
        <div><strong>{conteoEstados.Confirmado}</strong><span>Turnos activos</span></div>
        <div><strong>{conteoEstados.Completado + conteoEstados.NoSePresento}</strong><span>Histórico</span></div>
      </section>
      {/* El panel se dibuja siempre (si no, el admin no podría ni crear el
          primer servicio), así que el aviso de carga fallida va arriba: sin
          esto, un backend caído se veía como un panel vacío pero "funcionando". */}
      {errorCarga && <div className="simple-feedback error admin-feedback">{errorCarga} Los paneles de abajo se muestran igual, pero esos datos están vacíos o desactualizados.</div>}
      <section className="simple-card admin-tabs">
        {opcionesPestana.map((t) => <button key={t.id} type="button" aria-pressed={pestanaActiva === t.id} className={`admin-tab ${pestanaActiva === t.id ? 'selected' : ''}`} onClick={() => setPestanaActiva(t.id)}>{t.label}</button>)}
      </section>
      <section className="admin-content">
        {pestanaActiva === 'resumen' && <Resumen opcionesEstado={opcionesEstado} conteoEstados={conteoEstados} />}
        {pestanaActiva === 'profesionales' && <Profesionales todosProfesionales={todosProfesionales} formularioProfesional={formularioProfesional} profesionales={profesionales} profesionalVacio={profesionalVacio} onCambioFormularioProfesional={setFormularioProfesional} onGuardarProfesional={guardarProfesional} onCancelarEdicionProfesional={() => setFormularioProfesional(profesionalVacio)} onBorrarProfesional={confirmarBorradoProfesional} onEmpezarEdicionProfesional={cargarProfesionalEnForm} onCambiarActivoProfesional={onCambiarActivoProfesional} />}
        {pestanaActiva === 'servicios' && <Servicios servicioVacio={servicioVacio} onCancelarEdicionServicio={() => setFormularioServicio(servicioVacio)} onBorrarServicio={confirmarBorradoServicio} onCambioFormularioServicio={setFormularioServicio} onGuardarServicio={guardarServicio} onEmpezarEdicionServicio={cargarServicioEnForm} formularioServicio={formularioServicio} servicios={servicios} />}
        {pestanaActiva === 'horarios' && <Horarios profesionales={profesionales} bloqueosPorFecha={bloqueosPorFecha} horarioLaboral={horarioLaboral} onGuardarBloqueos={onGuardarBloqueos} onGuardarHorarios={onGuardarHorarios} profesionalHorario={profesionalHorario} fechaHorario={fechaHorario} setProfesionalHorario={setProfesionalHorario} setFechaHorario={setFechaHorario} horariosFijos={horariosFijos} />}
        {pestanaActiva === 'turnos' && <Turnos profesionales={profesionales} formularioTurno={formularioTurno} etiquetasEstado={etiquetasEstado} clasesEstado={clasesEstado} opcionesEstado={opcionesEstado} turnos={turnos} onCambioFormularioTurno={setFormularioTurno} onGuardarTurno={guardarTurno} onBorrarTurno={onBorrarTurno} onEmpezarEdicionTurno={cargarTurnoEnForm} servicios={servicios} turnoSeleccionado={turnoSeleccionado} />}
        {pestanaActiva === 'agenda' && <Agenda turnos={turnos} profesionales={profesionales} etiquetasEstado={etiquetasEstado} clasesEstado={clasesEstado} />}
      </section>
      <div className={`simple-feedback ${aviso.type} admin-feedback`}>{aviso.message}</div>
      <PieDePagina />
    </main>
  );
}
export default Admin;