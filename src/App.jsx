// ═══════════════════════════════════════════════════════════════════
// App.jsx — EL CORAZÓN DE LA APLICACIÓN (estado global + orquestador)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA ESTE ARCHIVO?
//
// Este componente es el "cerebro" de toda la SPA. Su trabajo es:
//   1. CENTRALIZAR EL ESTADO: guarda TODO lo que necesita la app en un
//      único lugar (sesión, catálogos, selección del turnero, turnos,
//      disponibilidad, bloqueos y horarios). Así todos los componentes
//      ven la misma información y se mantienen sincronizados.
//   2. ORQUESTAR LAS PETICIONES: concentra todas las llamadas al backend
//      (a través de src/servicios/api.js). Decide CUÁNDO pedir datos,
//      QUÉ pedir y QUÉ hacer cuando llegan o fallan.
//   3. CONTROLAR EL FLUJO DE PANTALLAS: según el usuario logueado
//      (role: 'admin' o 'cliente') decide qué vista renderizar:
//      - admin  → Panel de administración (components/admin/Admin.jsx)
//      - client → Turnero para reservar (components/cliente/Inicio.jsx)
//                 o "Mis turnos" (components/cliente/MisTurnos.jsx)
//      - sin sesión → Pantalla de login/registro (IniciarSesion.jsx)
//   4. PASAR DATOS POR PROPS: baja estado y funciones a los hijos
//      (prop-drilling). No usa Context/Redux a propósito: el flujo es
//      unidireccional y fácil de seguir para este tamaño de app.
//
// FLUJO DE DATOS (cómo viaja la información):
//   UI (componentes) → App.jsx (handlers/estado)
//                    → src/servicios/api.js (peticion/fetch)
//                    → Backend Express (server/index.js + rutas)
//                    → SQL Server (BD)
//                    ← respuesta JSON ← vuelve por el mismo camino ← actualiza estado ← re-renderiza UI
//
// REGLAS DE NEGOCIO (aplicadas aquí + en funciones.js):
//   - Domingos (0) y lunes (1): DÍAS CERRADOS (esDiaCerrado).
//   - Ventana de reservas: ÚNICAMENTE desde HOY (00:00) hasta HOY + 30 DÍAS (23:59:59).
//   - Turnos de 30 minutos. Los horarios disponibles salen del HorarioLaboral
//     del profesional (DB). Si NO tiene horario cargado, usa horariosFijos
//     de respaldo (src/datos/semilla.js).
//   - Disponibilidad = horarios del día − (turnos ocupados + bloqueos puntuales/día completo).
//   - Cancelaciones/reprogramaciones cliente: requieren > 24 hs de antelación
//     (validado también en backend para que no se salteen por API).
// ═══════════════════════════════════════════════════════════════════

// ── Imports ──────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';  // Hooks de React
import './App.css';  // Estilos globales de la app
// Componentes de pantalla:
import Admin from './components/admin/Admin';                 // Panel de administración
import Inicio from './components/cliente/Inicio';             // Turnero del cliente
import IniciarSesion from './components/ingreso/IniciarSesion'; // Login y registro
import MisTurnos from './components/cliente/MisTurnos';       // Historial "Mis turnos"
import WhatsApp from './components/comunes/WhatsApp';        // Botón flotante de WhatsApp
// Datos semilla (respaldo de arranque, la DB es la fuente real):
import { horariosFijos } from './datos/semilla';
// Funciones de la API (todas las llamadas al backend, ver src/servicios/api.js):
import { actualizarProfesional, actualizarServicio, actualizarTurno, cancelarTurno, crearProfesional, crearServicio, eliminarProfesional, eliminarServicio, eliminarTurno, guardarBloqueos, guardarHorarios, loginCliente, obtenerBloqueos, obtenerHorarios, obtenerProfesionales, obtenerServicios, obtenerTurnos, obtenerTurnosCliente, obtenerTurnosDisponibles, obtenerTurnosOcupados, registrarCliente, reservarTurno, verificarToken } from './servicios/api';
// Utilidades de fechas/horarios/estados (ver src/utilidades/funciones.js):
import { sePuedeCancelar, formatoFecha, bloqueosDeLaFecha, patronDelDia, horariosDeLaSemana, horariosPasados, esDiaCerrado, estadoDelTurno, datosDelDia, fechaAIso } from './utilidades/funciones';

// ── Constantes de calendario ─────────────────────────
// Ventana de reservas: de HOY (0:00) hasta HOY + 30 días (23:59:59).
// Tanto el turnero como el calendario mensual se limitan a este rango.
const today = new Date(), calendarStart = new Date(today), calendarEnd = new Date(today);
calendarStart.setHours(0, 0, 0, 0); calendarEnd.setDate(calendarEnd.getDate() + 30); calendarEnd.setHours(23, 59, 59, 999);
// Fecha inicial seleccionada en el turnero = hoy, en formato 'YYYY-MM-DD'
// (formato ISO sin hora, que es como espera el backend).
const initialCalendarDate = fechaAIso(calendarStart);

function App() {
  // ── Estado global ────────────────────────────────
  // -------------------------------------------------------------------
  // ESTADO DE SESIÓN
  //   vista      → qué vista muestra el cliente: 'cliente' (turnero)
  //                   o 'mis-turnos' (mis turnos)
  //   token         → el JWT del backend. Al arrancar se lee de localStorage
  //                   para que la sesión sobreviva al recargar la página.
  //   currentUser   → el usuario logueado: { role: 'admin'|'cliente', ... }
  //   sesionIniciada→ ¿hay token Y usuario? Si no → muestra el login.
  // -------------------------------------------------------------------
  const [vista, setVista] = useState('cliente');
  const [token, setToken] = useState(() => { try { return localStorage.getItem('token') ?? ''; } catch { return ''; } });
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null'); } catch { return null; } });
  const sesionIniciada = Boolean(token && currentUser);

  // Formulario de ingreso: pantalla activa ('ingreso' | 'registro') y sus campos
  const [pantallaAcceso, setPantallaAcceso] = useState('ingreso');
  const [correoIngreso, setCorreoIngreso] = useState(''); const [claveIngreso, setClaveIngreso] = useState('');
  const [formularioRegistro, setFormularioRegistro] = useState({ nombre: '', apellido: '', email: '', telefono: '', password: '' });
  // Mensaje que se muestra en la pantalla de ingreso (idle/error/success)
  const [avisoAcceso, setAvisoAcceso] = useState({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });

  // -------------------------------------------------------------------
  // CATÁLOGO (viene de la API / SQL Server)
  //   profesionales   → profesionales ACTIVOS (los que puede elegir el cliente)
  //   todosProfesionales→ TODOS (activos + inactivos), para el panel de admin
  //   servicios  → el catálogo de servicios (corte, barba, etc.)
  // -------------------------------------------------------------------
  const [profesionales, setProfesionales] = useState([]);
  const [todosProfesionales, setTodosProfesionales] = useState([]);
  const [servicios, setServicios] = useState([]);

  // -------------------------------------------------------------------
  // SELECCIÓN del turnero (el asistente del cliente)
  // Guarda lo que el usuario va eligiendo paso a paso: profesional,
  // servicio, fecha, hora, y sus datos de contacto para confirmar.
  // -------------------------------------------------------------------
  const [profesionalSeleccionado, setProfesionalSeleccionado] = useState(null);
  const [servicioSeleccionado, setServicioSeleccionado] = useState(null);
  const [fechaSeleccionada, setFechaSeleccionada] = useState(initialCalendarDate);
  const [horaSeleccionada, setHoraSeleccionada] = useState('09:00');
  const [nombreCliente, setNombreCliente] = useState(''); const [telefonoCliente, setTelefonoCliente] = useState('');

  // Turnos traídos de la API. Para el cliente son SOLO los suyos,
  // para el admin son TODOS los del negocio.
  const [turnosConfirmados, setTurnosConfirmados] = useState([]);

  // aviso: mensaje de éxito/error/idle en el turnero.
  // enviando: flag que evita el doble envío del formulario.
  const [aviso, setAviso] = useState({ type: 'idle', message: 'Elegí profesional, día y horario para reservar.' });
  const [enviando, setSubmitting] = useState(false);

  // -------------------------------------------------------------------
  // DISPONIBILIDAD (lo que está ocupado / bloqueado)
  //   horariosOcupadosApi → horas ocupadas de la fecha+barbero elegidos
  //   cargandoDisponibilidad → indicador de carga mientras se consulta a la API
  //   bloqueosPorFecha       → bloqueos puntuales del admin (día u horario)
  //   horarioLaboral      → horario semanal por profesional (si está en DB)
  //   rangoReservado         → TODOS los turnos ocupados de los próximos 30
  //                         días, para pintar el calendario mensual
  // -------------------------------------------------------------------
  const [horariosOcupadosApi, setHorariosOcupadosApi] = useState([]);
  const [cargandoDisponibilidad, setLoadingAvailability] = useState(true);
  const [bloqueosPorFecha, setBloqueosPorFecha] = useState([]);
  const [horarioLaboral, setHorarioLaboral] = useState([]);
  const [rangoReservado, setBookedRange] = useState([]);
  // Qué pedido de la carga inicial falló, para no quedar en "Cargando datos..."
  // para siempre sin explicar por qué. Vacío = todo cargó bien.
  const [errorCarga, setErrorCarga] = useState('');
// Contador que se incrementa al pedir "reintentar". El efecto de carga inicial
// lo tiene entre sus dependencias, así que basta con tocarlo para que vuelva a
// pedir todo. Antes no había forma de reintentar: la pantalla de error solo
// ofrecía cerrar sesión.
const [intentoRecarga, setIntentoRecarga] = useState(0);

  // ── Sincronización de selección ───────────────────
  // Si el barbero o servicio seleccionado ya no existe en la lista
  // (por ejemplo al recargar datos), se vuelve a seleccionar el primero.
  useEffect(() => { if (profesionales.length > 0 && !profesionales.some((b) => b.id === profesionalSeleccionado)) setProfesionalSeleccionado(profesionales[0].id); }, [profesionales, profesionalSeleccionado]);
  useEffect(() => { if (servicios.length > 0 && !servicios.some((s) => s.id === servicioSeleccionado)) setServicioSeleccionado(servicios[0].id); }, [servicioSeleccionado, servicios]);
  // Pre-carga el nombre y teléfono del cliente logueado en el formulario
  useEffect(() => { setNombreCliente(currentUser?.name ?? ''); setTelefonoCliente(currentUser?.phone ?? ''); }, [currentUser]);

  // ── Sesión y autenticación ───────────────────────
  // Expulsa al usuario: limpia estado + localStorage y vuelve al login.
  // Se usa cuando el token expira o el backend responde 401 (sesión inválida).
  const expulsarPorSesion = useCallback(() => {
    setToken(''); setCurrentUser(null); setTurnosConfirmados([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setPantallaAcceso('ingreso'); setCorreoIngreso(''); setClaveIngreso('');
    setAvisoAcceso({ type: 'error', message: 'Tu sesión venció. Iniciá sesión de nuevo para continuar.' });
  }, []);

  // Al arrancar (y cada vez que cambia el token) le pregunta al backend
  // "¿este token sigue siendo válido?" (GET /verificar).
  // Si no lo es → expulsa. Los usuarios de Google se excluyen porque
  // su token 'mock-google' no es un JWT real del backend.
  useEffect(() => {
    let cancelado = false;
    if (!token || !currentUser || currentUser.provider === 'google') return;
    verificarToken(token)
      .then(() => { if (cancelado) return; setAvisoAcceso({ type: 'success', message: currentUser.role === 'admin' ? 'Bienvenido administrador.' : `Sesión iniciada con ${currentUser.email}.` }); })
      .catch(() => { if (!cancelado) expulsarPorSesion(); });
    return () => { cancelado = true; };  // evita setState si el componente se desmontó antes
  }, [token, currentUser, expulsarPorSesion]);

  // ── Carga de datos desde la API ───────────────────
  // Trae los profesionales ACTIVOS y los mapea al formato que usan los
  // componentes: { id, name, email, telefono } (viene como idProfesional,
  // nombre, etc. desde SQL Server).
  const cargarProfesionales = useCallback(async () => {
    if (!token) return;
    try {
      const p = await obtenerProfesionales(token);
      if (Array.isArray(p) && p.length > 0) setProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
    } catch (error) { console.warn('No se pudieron obtener los profesionales:', error); }
  }, [token]);

  // Igual pero trae TODOS los profesionales (activos e inactivos) con su
  // flag `activo`. Lo usa el panel de admin para poder reactivar bajas.
  const cargarTodosProfesionales = useCallback(async () => {
    if (!token) return;
    try {
      const p = await obtenerProfesionales(token, true);
      if (Array.isArray(p)) setTodosProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
    } catch (error) { console.warn('No se pudieron obtener todos los profesionales:', error); }
  }, [token]);

  // Trae el catálogo de servicios y lo mapea a { id, name, price, durationMinutes }.
  const cargarServicios = useCallback(async () => {
    try {
      const s = await obtenerServicios();
      if (Array.isArray(s) && s.length > 0) setServicios(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
    } catch (error) { console.warn('No se pudieron obtener los servicios:', error); }
  }, []);

  // ── Carga inicial de datos (Profesionales/Servicios/Bloqueos/Horarios) ──
  // Primer render CON SESIÓN: lanza 6 llamadas a la API EN PARALELO (Promise.allSettled):
  //   1. profesionales activos    4. bloqueos del admin
  //   2. todos los profesionales  5. horarios laborales
  //   3. servicios                6. turnos ocupados de los próximos 30 días
  // Se usa allSettled y NO all porque antes el fallo de UNA sola request
  // (por ejemplo /bloqueos) rechazaba el Promise entero y dejaba profesionales
  // y servicios sin cargar, sin mostrar ningún error. Ahora cada request se
  // aplica por separado: las que funcionan cargan igual, y las que fallan se
  // anotan en la consola + en errorCarga (que se muestra en pantalla).
  // `cancelado` evita pisar el estado si el componente se desmonta antes.
  //
  // OJO: depende de `token` a propósito. /horarios, /bloqueos, /turnos/ocupados y
  // /turnos/disponibles exigen token, así que sin sesión esta tanda fallaría
  // entera. Con el token en las dependencias, los 6 requests se re-disparan
  // cuando el usuario se loguea y la agenda carga recién, con datos de verdad.
  useEffect(() => {
    if (!token) return;
    let cancelado = false;
    // valor(): si la request se rechazó devuelve null (y avisa por consola),
    // si salió bien devuelve la respuesta para seguir mapeándola normal.
    const valor = (resultado, etiqueta) => {
      if (resultado.status === 'rejected') { console.warn(`[carga inicial] Falló ${etiqueta}:`, resultado.reason); return null; }
      return resultado.value;
    };
    Promise.allSettled([obtenerProfesionales(token), obtenerProfesionales(token, true), obtenerServicios(), obtenerBloqueos(token), obtenerHorarios(token), obtenerTurnosOcupados(initialCalendarDate, fechaAIso(calendarEnd), token)])
      .then(([rp, rpa, rs, rb, rh, ro]) => {
        if (cancelado) return;
        const fallidas = [];
        const p = valor(rp, 'profesionales') ?? (fallidas.push('profesionales'), null);
        const pa = valor(rpa, 'todos los profesionales') ?? (fallidas.push('todos los profesionales'), null);
        const s = valor(rs, 'servicios') ?? (fallidas.push('servicios'), null);
        const b = valor(rb, 'bloqueos') ?? (fallidas.push('bloqueos'), null);
        const h = valor(rh, 'horarios') ?? (fallidas.push('horarios'), null);
        const o = valor(ro, 'turnos ocupados') ?? (fallidas.push('turnos ocupados'), null);
        if (Array.isArray(p) && p.length > 0) setProfesionales(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
        if (Array.isArray(pa)) setTodosProfesionales(pa.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
        if (Array.isArray(s) && s.length > 0) setServicios(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
        if (Array.isArray(b)) setBloqueosPorFecha(b);
        if (Array.isArray(h)) setHorarioLaboral(h);
        if (Array.isArray(o)) setBookedRange(o);
        setErrorCarga(fallidas.length ? `No se pudo cargar: ${fallidas.join(', ')}. Revisá que el backend esté corriendo.` : '');
      });
return () => { cancelado = true; };
    }, [token, intentoRecarga]);

  // Vuelve a pedir todos los turnos ocupados del mes entero. Se usa después
  // de reservar/cancelar/reprogramar para refrescar el calendario mensual.
  const refrescarOcupados = useCallback(() => {
    if (!token) return;
    obtenerTurnosOcupados(initialCalendarDate, fechaAIso(calendarEnd), token)
      .then((o) => { if (Array.isArray(o)) setBookedRange(o); })
      .catch(() => {});
  }, [token]);

  // SQL Server devuelve las horas como 'HH:MM' porque el backend las convierte
  // con CONVERT(varchar(5), horaInicio, 108) en TODAS las consultas.
  //
  // OJO — esto es una trampa real: en crudo, tedious devuelve una columna TIME
  // como un objeto Date de 1970-01-01 (NO como texto), y antes de que el
  // backend hiciera el CONVERT, este normalize devolvía '' en silencio para
  // todas las horas. Como abajo se hace `.filter(Boolean)`, la lista de
  // ocupados quedaba VACÍA sin dar ningún error: el calendario pintaba todos
  // los días "libre" y el cliente no podía cancelar ni reprogramar (porque
  // sePuedeCancelar necesita la hora). Por eso, si algún día esto no puede
  // normalizar, AVISA en vez de devolver '' en silencio.
  const normalizarHoraApi = useCallback((valor) => {
    if (!valor) return '';
    const s = String(valor).trim();
    const hhmmss = s.includes('T') ? s.split('T')[1].replace('Z', '') : s;
    const p = hhmmss.slice(0, 8).split(':');
    if (!p[1]) { console.warn('[horaApi] No se pudo normalizar la hora que llegó del backend:', valor); return ''; }
    return `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}`;
  }, []);

  // Consulta a la API qué horas ya están ocupadas para la fecha + barbero
  // elegidos y guarda SOLO la hora de inicio de cada turno (ej. '10:30').
  // Se re-ejecuta automáticamente (gracias al useEffect de abajo) cada
  // vez que cambia el día seleccionado o el profesional.
  const cargarDisponibilidad = useCallback(() => {
    if (!token || !fechaSeleccionada || !profesionalSeleccionado) return;  // falta sesión o falta elegir algo
    setLoadingAvailability(true);  // prende el indicador de carga
    obtenerTurnosDisponibles(fechaSeleccionada, profesionalSeleccionado, token)
      .then((r) => setHorariosOcupadosApi((r?.turnosOcupados ?? []).map((t) => normalizarHoraApi(t.horaInicio)).filter(Boolean)))
      .catch(() => setHorariosOcupadosApi([]))
      .finally(() => setLoadingAvailability(false));  // siempre apaga el indicador de carga
  }, [token, fechaSeleccionada, profesionalSeleccionado, normalizarHoraApi]);
  useEffect(() => { cargarDisponibilidad(); }, [cargarDisponibilidad]);

  // Trae los turnos del CLIENTE logueado y los convierte a un formato único
  // para la UI. `estadoDelTurno` calcula en qué estado está cada turno
  // (pendiente / vencido / completado / cancelado / no-show) según su fecha,
  // hora y el momento actual.
  const cargarMisTurnos = useCallback(async () => {
    if (!currentUser?.idCliente || !token) return;
    try {
      const res = await obtenerTurnosCliente(currentUser.idCliente, token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setTurnosConfirmados(lista.map((t) => {
        const fechaIso = fechaAIso(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const estado = estadoDelTurno(t.estado, fechaIso, hora);
        return { id: t.idTurno, emailCliente: currentUser.email, idProfesional: t.idProfesional ?? null, nombreProfesional: t.profesional, nombreServicio: t.servicio, precioServicio: t.precioTotal, fecha: fechaIso, hora, nombreCliente: currentUser.name, estado, ...datosDelDia(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [currentUser, token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (sesionIniciada && currentUser?.role !== 'admin') cargarMisTurnos(); }, [sesionIniciada, cargarMisTurnos, currentUser?.role]);
  // Auto-refresco para el cliente: vuelve a cargar "Mis turnos" cada 20
  // segundos y al volver a la pestaña (visibilitychange). Así el estado de
  // un turno se actualiza solo (ej. de 'pendiente' a 'completado').
  useEffect(() => {
    if (!sesionIniciada || currentUser?.role === 'admin') return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargarMisTurnos(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargarMisTurnos(); }, 20000);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [sesionIniciada, currentUser?.role, cargarMisTurnos]);

  // Igual que cargarMisTurnos pero para el ADMIN: trae TODOS los turnos del
  // negocio con sus JOINs (nombre del cliente, del barbero y del servicio).
  const cargarTurnosAdmin = useCallback(async () => {
    if (!token) return;
    try {
      const res = await obtenerTurnos(token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setTurnosConfirmados(lista.map((t) => {
        const fechaIso = fechaAIso(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const estado = estadoDelTurno(t.estado, fechaIso, hora);
        return { id: t.idTurno, idCliente: t.idCliente ?? null, emailCliente: t.email ?? '', idProfesional: t.idProfesional ?? null, idServicio: t.idServicio ?? null, nombreProfesional: t.profesional, nombreServicio: t.servicio, precioServicio: t.precioTotal, fecha: fechaIso, hora, nombreCliente: t.nombreCliente ?? '', telefonoCliente: t.telefono ?? '', estado, ...datosDelDia(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (sesionIniciada && currentUser?.role === 'admin') cargarTurnosAdmin(); }, [sesionIniciada, cargarTurnosAdmin, currentUser?.role]);

  // ── Disponibilidad del día (horarios libres/ocupados) ──
  // Construye el "mapa de ocupación": { [idBarbero]: { 'YYYY-MM-DD': ['10:30', ...] } }
  // combinando el rango del calendario mensual (rangoReservado) con los turnos
  // ya cargados (turnosConfirmados). `meter()` agrega una hora al mapa.
  const turnosOcupados = useMemo(() => {
    const snap = {};  // el mapa arranca vacío; lo llenan los turnos de abajo
    const meter = (idProfesional, dayKey, time) => {  // marca una hora como ocupada
      if (idProfesional == null || dayKey == null || !time) return;
      const bs = snap[idProfesional] ?? (snap[idProfesional] = {});
      bs[dayKey] = [...(bs[dayKey] ?? []), time];
    };
    rangoReservado.forEach((t) => {
      const hora = normalizarHoraApi(t.horaInicio);
      if (!hora) return;
      meter(t.idProfesional, fechaAIso(t.fecha), hora);
    });
    turnosConfirmados.forEach((b) => meter(b.idProfesional, fechaAIso(b.fecha), b.hora));
    return snap;
  }, [rangoReservado, turnosConfirmados, normalizarHoraApi]);

  // ── Datos derivados del día seleccionado ──────────
  const profesionalActual = profesionales.find((b) => b.id === profesionalSeleccionado) ?? profesionales[0] ?? null;
  const servicioActual = servicios.find((s) => s.id === servicioSeleccionado) ?? servicios[0] ?? null;
  const diaSeleccionado = new Date(`${fechaSeleccionada}T00:00:00`);
  const patronDiaSeleccionado = patronDelDia(diaSeleccionado);  // 'weekday' | 'saturday' | null
  const fechaFormateada = formatoFecha(diaSeleccionado);     // { label, date }
  const diaActual = { id: patronDiaSeleccionado ?? 'dom', label: fechaFormateada.label, date: fechaFormateada.date };
  // Horarios posibles del día: usa el horario laboral si existe en la DB,
  // si no, cae en el horario fijo de respaldo (horariosFijos de semilla.js)
  const horariosDelDia = patronDiaSeleccionado ? horariosDeLaSemana(horarioLaboral, profesionalSeleccionado, patronDiaSeleccionado, horariosFijos) : [];
  // Lo bloqueado = turnos ya tomados + bloqueos puntuales que cargó el admin
  const horariosBloqueadosLocales = patronDiaSeleccionado ? [...(turnosOcupados[profesionalSeleccionado]?.[fechaSeleccionada] ?? []), ...bloqueosDeLaFecha(bloqueosPorFecha, profesionalSeleccionado, fechaSeleccionada, horariosDelDia)] : horariosDelDia;
  // Si la fecha elegida es HOY, los horarios que ya pasaron también quedan "no
  // disponibles" (se grisean en la grilla como los ocupados y el auto-ajuste
  // de la hora elige uno válido). El backend además los rechaza con 400.
  const horariosPasadosHoy = horariosPasados(fechaSeleccionada, horariosDelDia);
  const horariosNoDisponibles = [...new Set([...horariosBloqueadosLocales, ...horariosOcupadosApi, ...horariosPasadosHoy])];  // sin duplicados
  // DISPONIBLES = todos los horarios del día − los no disponibles
  const horariosLibres = horariosDelDia.filter((s) => !horariosNoDisponibles.includes(s));
  // Auto-ajuste de la hora elegida: si no quedan horarios la limpia; si el
  // horario elegido dejó de estar disponible, elige el primero libre.
  useEffect(() => { if (horariosLibres.length === 0) { setHoraSeleccionada(''); return; } if (!horariosLibres.includes(horaSeleccionada)) setHoraSeleccionada(horariosLibres[0]); }, [horariosLibres, horaSeleccionada]);
  const horaEstaOcupada = horaSeleccionada ? horariosNoDisponibles.includes(horaSeleccionada) : true;
  // Reglas de negocio aplicadas al día seleccionado:
  const esDomingoOLunes = esDiaCerrado(diaSeleccionado.getDay());  // ¿cerrado ese día?
  const fueraDeRango = diaSeleccionado < calendarStart || diaSeleccionado > calendarEnd;  // ¿fuera de hoy +30?

  // ── Selección de fecha (validaciones) ──────────────
  // Se ejecuta al tocar un día del calendario. Valida: fecha válida,
  // dentro del rango [hoy, +30 días] y que no sea domingo/lunes.
  // Si algo falla, muestra el error y NO cambia la fecha seleccionada.
  const cambiarFechaCalendario = (nextDate) => {
    const nextDateObject = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(nextDateObject.getTime())) return;
    if (nextDateObject < calendarStart || nextDateObject > calendarEnd) { setAviso({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (esDiaCerrado(nextDateObject.getDay())) { setAviso({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    setFechaSeleccionada(nextDate);
  };

  // ── Handlers de sesión (logout, login, registro, Google) ──
  // Logout: limpia estado + localStorage y vuelve a la pantalla de login.
  const cerrarSesion = () => {
    setToken(''); setCurrentUser(null); setTurnosConfirmados([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setVista('cliente'); setPantallaAcceso('ingreso'); setCorreoIngreso(''); setClaveIngreso('');
    setFormularioRegistro({ nombre: '', apellido: '', email: '', telefono: '', password: '' });
    setAvisoAcceso({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });
  };

  // Login: manda usuario/mail + contraseña a POST /login. Según el `role`
  // que devuelva el backend arma un currentUser distinto:
  //   - admin  → { role: 'admin', ... } → vista de administración
  //   - client → { role: 'cliente', ... } → turnero
  // En ambos casos guarda token + usuario en localStorage.
  const iniciarSesion = async (event) => {
    event.preventDefault();
    const cred = correoIngreso.trim(), pass = claveIngreso.trim();
    if (!cred || !pass) { setAvisoAcceso({ type: 'error', message: 'Completá usuario/mail y contraseña para iniciar sesión.' }); return; }
    try {
      setAvisoAcceso({ type: 'idle', message: 'Iniciando sesión...' });
      const r = await loginCliente(cred, pass);
      if (r?.role === 'admin') {
        const admin = { idCliente: null, idAdmin: r.admin?.idAdmin ?? null, name: r.admin?.nombre ?? 'Administrador', email: r.admin?.email ?? cred, role: 'admin' };
        setToken(r.token); setCurrentUser(admin);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(admin)); } catch {}
        setVista('admin'); setAvisoAcceso({ type: 'success', message: 'Acceso de administrador habilitado.' });
      } else {
        const u = { idCliente: r.cliente?.idCliente ?? null, name: r.cliente?.nombre ?? cred.split('@')[0], email: cred, role: 'cliente', phone: r.cliente?.telefono ?? '' };
        setToken(r.token); setCurrentUser(u);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(u)); } catch {}
        setVista('cliente'); setAvisoAcceso({ type: 'success', message: `Sesión iniciada con ${cred}.` });
      }
    } catch (error) { setAvisoAcceso({ type: 'error', message: error.message || 'Credenciales incorrectas.' }); }
  };

  // ⚠️ "Continuar con Google" es SOLO un mock de prueba, NO el login real de
  // Google (ese código está en la rama respaldo-google, a la espera de que se
  // configure un GOOGLE_CLIENT_ID). El mock crea un usuario sin idCliente con
  // un token inválido 'mock-google'.
  //
  // OJO con por qué NO se deja "funcionando" a medias: antes guardaba ese token
  // en localStorage y ponía al usuario en sesión. Como el backend no reconoce
  // el token, sus 6 requests de carga inicial devolvían 401, la app caía en la
  // pantalla de error y ahí se quedaba encerrado (esa pantalla no tenía ni
  // cerrar sesión). Ahora avisamos en vez de simular una sesión que no existe:
  // el mock queda para probar la UI sin loguearse de verdad.
  const ingresarConGoogle = () => {
    setPantallaAcceso('ingreso');
    setAvisoAcceso({
      type: 'error',
      message: 'El acceso con Google todavía no está habilitado. Iniciá sesión con tu mail y contraseña, o registrate.',
    });
  };

  // Registro: crea la cuenta en la DB (POST /registro), vuelve a la pantalla
  // de login y pre-carga el mail para que el usuario solo escriba la clave.
  const crearCuenta = async (event) => {
    event.preventDefault(); const { nombre, apellido, email, telefono, password } = formularioRegistro;
    if (!nombre.trim() || !apellido.trim() || !email.trim() || !password.trim() || !telefono.trim()) { setAvisoAcceso({ type: 'error', message: 'Completá nombre, apellido, mail, contraseña y whatsapp para registrarte.' }); return; }
    // El mismo mínimo de 8 que valida el server (server/validaciones.js).
    // Va del lado del cliente para no gastar un request y para que el mensaje
    // salga en la voz de la app y no en el del navegador.
    if (password.length < 8) { setAvisoAcceso({ type: 'error', message: 'La contraseña tiene que tener al menos 8 caracteres.' }); return; }
    try {
      setAvisoAcceso({ type: 'idle', message: 'Creando tu cuenta...' });
      await registrarCliente({ nombre: nombre.trim(), apellido: apellido.trim(), email: email.trim(), telefono: telefono.trim(), password });
      setPantallaAcceso('ingreso'); setCorreoIngreso(email.trim()); setClaveIngreso('');
      setAvisoAcceso({ type: 'success', message: `¡Cuenta creada! Ya podés iniciar sesión con ${email.trim()}.` });
    } catch (error) { setAvisoAcceso({ type: 'error', message: error.message || 'Error al registrar el cliente.' }); }
  };

  // ── Reserva de turno ───────────────────────────────
  // Es el paso final del turnero. Re-valida todo por las dudas
  // (nombre+teléfono, cuenta vinculada a la DB, día habilitado, hora libre),
  // llama a POST /turnos y después refresca la disponibilidad y los turnos.
  const registrarTurno = async (event) => {
    event.preventDefault();
    if (!nombreCliente.trim() || !telefonoCliente.trim()) { setAviso({ type: 'error', message: 'Completá tu nombre y teléfono para confirmar el turno.' }); return; }
    if (!currentUser?.idCliente) { setAviso({ type: 'error', message: 'Tu cuenta no está vinculada a un cliente de la base. Iniciá sesión con tu cuenta registrada.' }); return; }
    if (esDomingoOLunes) { setAviso({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    if (fueraDeRango) { setAviso({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (!horaSeleccionada || horaEstaOcupada) { setAviso({ type: 'error', message: 'Elegí un horario disponible antes de confirmar.' }); return; }
    if (enviando) return;  // evita el doble envío con el botón
    try {
      setSubmitting(true);
      setAviso({ type: 'idle', message: 'Confirmando tu turno...' });
      await reservarTurno({ idCliente: currentUser.idCliente, idProfesional: profesionalSeleccionado, idServicio: servicioSeleccionado, fecha: fechaSeleccionada, horaInicio: horaSeleccionada, telefono: telefonoCliente.trim() }, token);
      setAviso({ type: 'success', message: `Turno confirmado para ${nombreCliente.trim()} con ${profesionalActual.name} (${servicioActual.name}, $${servicioActual.price.toLocaleString('es-AR')}) el ${fechaFormateada.label} ${fechaFormateada.date} a las ${horaSeleccionada}.` });
      setNombreCliente(currentUser?.name ?? ''); setTelefonoCliente(currentUser?.phone ?? ''); setHoraSeleccionada('');
      // Refresca todo lo afectado por la nueva reserva:
      cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos();
    } catch (error) { setAviso({ type: 'error', message: error.message || 'Error al reservar el turno.' }); }
    finally { setSubmitting(false); }  // siempre desbloquea el botón
  };

  // ── Datos derivados para vista del cliente ─────────
  const cantidadOcupados = horariosDelDia.length - horariosLibres.length;  // cuántos horarios del día están ocupados
  const emailUsuario = currentUser?.email ?? '';
  // Turnos del cliente logueado = los confirmadoBookings que son SUYOS
  //
  // OJO con el orden: la API los trae como `ORDER BY fecha DESC` (el más nuevo
  // primero), y turnosPendientes/turnosExpirados heredan ese orden. Sin este
  // sort, "el próximo turno" del banner era el MÁS LEJANO y la lista de
  // pendientes salía al revés. Se ordena por fecha + hora ascendente.
  const turnosDelUsuario = useMemo(
    () => turnosConfirmados.filter((b) => b.emailCliente === emailUsuario).slice().sort((l, r) => `${l.fecha}T${l.hora}`.localeCompare(`${r.fecha}T${r.hora}`)),
    [turnosConfirmados, emailUsuario]
  );
  // Confirmado = próximos / Expirado = pasados (según estadoDelTurno)
  const turnosPendientes = turnosDelUsuario.filter((b) => b.estado === 'Confirmado');
  const turnosExpirados = turnosDelUsuario.filter((b) => b.estado === 'Expirado'); const proximosTurnos = turnosPendientes.slice(0, 3);  // los 3 próximos para el banner

  // ── Cancelar y reprogramar turno (cliente) ─────────
  // Cancela el turno en la DB (estado → 'Cancelado') previa confirmación.
  // La regla de las >24 h de antelación la valida sePuedeCancelar en funciones.js.
  const anularTurno = async (bookingId) => {
    if (!window.confirm('¿Seguro que querés cancelar este turno?')) return;
    try { await cancelarTurno(bookingId, token); setAviso({ type: 'success', message: 'Turno cancelado correctamente.' }); cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos(); }
    catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al cancelar el turno.' }); }
  };

  // Reprograma: cambia fecha y/o hora con un PATCH a la API y actualiza en
  // local el turno con sus datos de calendario recalculados.
  const reprogramarTurno = async (bookingId, fecha, hora) => {
    if (!window.confirm('¿Confirmás el nuevo día y horario?')) return;
    try {
      setAviso({ type: 'idle', message: 'Reprogramando tu turno...' });
      await actualizarTurno(bookingId, { fecha, horaInicio: hora }, token);
      setTurnosConfirmados((p) => p.map((b) => (b.id === bookingId ? { ...b, fecha, hora, ...datosDelDia(fecha) } : b)));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarMisTurnos();
      setAviso({ type: 'success', message: 'Turno reprogramado correctamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al reprogramar el turno.' });
    }
  };

  // ── CRUD profesionales (agregar, actualizar, eliminar) ──
  // Divide 'Juan Pérez' → { nombre: 'Juan', apellido: 'Pérez' }
  // porque en la DB el nombre y el apellido son campos separados.
  const dividirNombre = (nombreCompleto) => {
    const partes = String(nombreCompleto).trim().split(/\s+/);
    return { nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
  };
  // Alta: crea el profesional, recarga las 2 listas y devuelve { ok }
  // para que el modal se cierre automáticamente si salió bien.
  const registrarProfesional = async (nombreCompleto, email, telefono) => {
    const { nombre, apellido } = dividirNombre(nombreCompleto);
    try {
      await crearProfesional({ nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al agregar el profesional.' }; }
  };
  // Edita un profesional (misma lógica que el alta).
  const editarProfesional = async (id, nombreCompleto, email, telefono) => {
    const { nombre, apellido } = dividirNombre(nombreCompleto);
    try {
      await actualizarProfesional(id, { nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al actualizar el profesional.' }; }
  };
  // Baja lógica (activo → 0): los turnos pasados se mantienen, pero ya no
  // recibe reservas nuevas.
  const borrarProfesional = async (id) => {
    if (!window.confirm('¿Eliminar a este profesional? Sus turnos se mantienen, pero ya no recibirá reservas nuevas.')) return { ok: false };
    try {
      await eliminarProfesional(id, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al eliminar el profesional.' }; }
  };
  // Activar / desactivar (interruptor del checkbox en el panel de admin).
  const cambiarActivoProfesional = async (id, activo) => {
    try {
      await actualizarProfesional(id, { activo: !activo }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al cambiar el estado del profesional.' }); return false; }
  };

  // ── CRUD servicios (agregar, actualizar, eliminar) ──
  // Los tres devuelven true/false para que el modal cierre o muestre error.
  const registrarServicio = async (name, price, durationMinutes) => {
    try {
      await crearServicio({ nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al agregar el servicio.' }); return false; }
  };
  const editarServicio = async (id, name, price, durationMinutes) => {
    try {
      await actualizarServicio(id, { nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al actualizar el servicio.' }); return false; }
  };
  // Borrado físico. Si el servicio tiene turnos asociados, el backend
  // responde error 547 (FK de SQL Server) y acá se muestra el aviso.
  const borrarServicio = async (id) => {
    if (!window.confirm('¿Eliminar este servicio del catálogo?')) return false;
    try {
      await eliminarServicio(id, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setAviso({ type: 'error', message: error.message || 'Error al eliminar el servicio.' }); return false; }
  };

  // ── Guardar bloqueos y horarios laborales ──────────
  // Guarda los bloqueos del admin y RECARGA la lista desde la API para que
  // el calendario del cliente refleje el cambio al instante.
  const guardarBloqueosFecha = useCallback(async (idProfesional, fecha, body) => {
    try {
      await guardarBloqueos(idProfesional, { fecha, ...body }, token);
      const b = await obtenerBloqueos(token);
      if (Array.isArray(b)) setBloqueosPorFecha(b);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);
  // Igual que el anterior pero para el horario SEMANAL del profesional
  // (hasta 2 bloques por día). También recarga para reflejar el cambio.
  const guardarHorariosSemanales = useCallback(async (idProfesional, horarios) => {
    try {
      await guardarHorarios(idProfesional, horarios, token);
      const h = await obtenerHorarios(token);
      if (Array.isArray(h)) setHorarioLaboral(h);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);
  // ── CRUD turnos admin (actualizar, eliminar) ───────
  // Edición completa del turno: profesional, servicio, fecha, hora, estado
  // y datos del cliente. Solo envía los campos que vienen definidos.
  // Después actualiza la lista local con los nombres nuevos de barbero/
  // servicio y recarga todo por API para quedar sincronizado.
  const editarTurno = async (bookingId, updates) => {
    try {
      setAviso({ type: 'idle', message: 'Guardando el turno...' });
      await actualizarTurno(bookingId, {
        idProfesional: updates.idProfesional ? Number(updates.idProfesional) : undefined,
        idServicio: updates.idServicio ? Number(updates.idServicio) : undefined,
        fecha: updates.fecha || undefined,
        horaInicio: updates.hora || undefined,
        // 'confirmed' ya no se manda: no es un estado real (ver opcionesEstado
        // en Admin.jsx). Los valores válidos coinciden con los que valida el backend.
        estado: ['Confirmado', 'Completado', 'NoSePresento', 'Cancelado'].includes(updates.estado) ? updates.estado : undefined,
        nombreCliente: updates.nombreCliente !== undefined ? updates.nombreCliente : undefined,
        telefono: updates.telefonoCliente,
      }, token);
      setTurnosConfirmados((p) => p.map((b) => { if (b.id !== bookingId) return b; const nb = profesionales.find((x) => x.id === Number(updates.idProfesional)) ?? profesionales[0]; const ns = servicios.find((x) => x.id === Number(updates.idServicio)) ?? servicios[0]; return { ...b, ...updates, idProfesional: updates.idProfesional != null ? Number(updates.idProfesional) : b.idProfesional, nombreProfesional: nb?.name ?? b.nombreProfesional, nombreServicio: ns?.name ?? b.nombreServicio, precioServicio: ns?.price ?? b.precioServicio, ...datosDelDia(updates.fecha) }; }));
      await cargarTurnosAdmin(); refrescarOcupados();
      setAviso({ type: 'success', message: 'Turno actualizado en la base de datos.' });
      return true;
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al actualizar el turno.' });
      return false;
    }
  };
  // Borrado definitivo del turno (delete físico en la DB, con confirmación).
  const borrarTurno = async (bookingId) => {
    if (!window.confirm('¿Eliminar este turno definitivamente?')) return;
    try {
      await eliminarTurno(bookingId, token);
      setTurnosConfirmados((p) => p.filter((b) => b.id !== bookingId));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarTurnosAdmin();
      setAviso({ type: 'success', message: 'Turno eliminado definitivamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setAviso({ type: 'error', message: error.message || 'Error al eliminar el turno.' });
    }
  };
  // ── Navegación entre vistas (cliente, mis turnos) ──
  // Cambia la vista del cliente usando el hash de la URL (#mis-turnos).
  // history.pushState permite que el botón atrás del navegador funcione.
  const verMisTurnos = () => { setVista('mis-turnos'); try { history.pushState({ view: 'mis-turnos' }, '', '#mis-turnos'); } catch {} };
  const volverAlCliente = () => { setVista('cliente'); try { history.pushState({ view: 'cliente' }, '', window.location.pathname); } catch {} };

  // Escucha el evento 'popstate' (botón atrás/adelante del navegador) y
  // sincroniza la vista con el hash actual de la URL.
  useEffect(() => {
    const onPop = () => {
      const isMyBookings = window.location.hash === '#mis-turnos';
      setVista(isMyBookings ? 'mis-turnos' : 'cliente');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Render de pantallas ────────────────────────────
  // 1) SIN SESIÓN  → IniciarSesion (login/registro) + botón WhatsApp.
  // 2) CLIENTE (y aún cargando datos) → pantalla "Cargando datos...".
  // 3) ADMIN       → Admin.jsx con todos los handlers del panel.
  // 4) CLIENTE     → 'mis-turnos' → MisTurnos (historial y cancelación)
  //                  → 'cliente'     → Inicio (el turnero de 5 pasos)
  if (!sesionIniciada) return (
    <>
      <IniciarSesion pantallaAcceso={pantallaAcceso} avisoAcceso={avisoAcceso} ingresarConGoogle={ingresarConGoogle} iniciarSesion={iniciarSesion} crearCuenta={crearCuenta} correoIngreso={correoIngreso} claveIngreso={claveIngreso} onMostrarIngreso={() => setPantallaAcceso('ingreso')} onMostrarRegistro={() => setPantallaAcceso('registro')} formularioRegistro={formularioRegistro} setCorreoIngreso={setCorreoIngreso} setClaveIngreso={setClaveIngreso} setFormularioRegistro={setFormularioRegistro} />
      <WhatsApp />
    </>
  );
  // Mientras no lleguen los profesionales y servicios, mostramos un loading
  // (así el turnero no aparece vacío/roto en el primer render). Si alguna
  // request falló, mostramos cuál fue en vez de quedarnos girando en silencio.
  //
  // OJO: esta pantalla TIENE que ofrecer salida. Antes renderizaba solo un <p>
  // con el error: sin cabecera, sin botón de cerrar sesión, sin reintentar.
  // El que caía acá quedaba atrapado y lo único que le funcionaba era borrar
  // el localStorage a mano desde la consola del navegador. Peor: el login mock
  // de Google (ingresarConGoogle) guarda un token que el backend no reconoce,
  // así que sus 6 requests dan 401 y caenan acá para siempre.
  if (currentUser?.role !== 'admin' && (profesionales.length === 0 || servicios.length === 0)) return (
    <main className="simple-page" style={{ display: 'grid', placeItems: 'center', alignContent: 'center', gap: '1.5rem', minHeight: '100svh', textAlign: 'center' }}>
      <div style={{ display: 'grid', gap: '0.65rem', maxWidth: '34rem' }}>
        <p role="alert" style={{ color: errorCarga ? 'var(--err)' : 'var(--text-mid)', margin: 0 }}>
          {errorCarga || 'Cargando datos...'}
        </p>
        {errorCarga && (
          <p style={{ color: 'var(--text-low)', fontSize: '0.92rem', margin: 0 }}>
            No pudimos cargar la agenda. Podés reintentar o cerrar sesión e entrar de nuevo.
          </p>
        )}
      </div>
      {errorCarga && (
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            type="button"
            onClick={() => { setErrorCarga(''); setIntentoRecarga((n) => n + 1); }}
            style={{ minHeight: '48px', padding: '0 1.6rem', borderRadius: 'var(--radius-sm)', border: 'none', background: 'var(--gold-gradient)', color: '#241a08', fontWeight: 700, cursor: 'pointer' }}
          >
            Reintentar
          </button>
          <button
            type="button"
            onClick={cerrarSesion}
            style={{ minHeight: '48px', padding: '0 1.6rem', borderRadius: 'var(--radius-sm)', background: 'var(--card-soft)', color: 'var(--text-hi)', border: '1px solid var(--line)', fontWeight: 600, cursor: 'pointer' }}
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </main>
  );
  return (
    <>
      {currentUser?.role === 'admin' ? (
        <Admin todosProfesionales={todosProfesionales} profesionales={profesionales} turnos={turnosConfirmados} currentUser={currentUser} bloqueosPorFecha={bloqueosPorFecha} errorCarga={errorCarga} horarioLaboral={horarioLaboral} onRegistrarProfesional={registrarProfesional} onRegistrarServicio={registrarServicio} onBorrarProfesional={borrarProfesional} onBorrarTurno={borrarTurno} onBorrarServicio={borrarServicio} onCerrarSesion={cerrarSesion} onGuardarBloqueos={guardarBloqueosFecha} onGuardarHorarios={guardarHorariosSemanales} onCambiarActivoProfesional={cambiarActivoProfesional} onEditarProfesional={editarProfesional} onEditarTurno={editarTurno} onEditarServicio={editarServicio} servicios={servicios} horariosFijos={horariosFijos} />
      ) : vista === 'mis-turnos' ? (
        <MisTurnos calendarMax={fechaAIso(calendarEnd)} calendarMin={initialCalendarDate} sePuedeCancelar={sePuedeCancelar} currentUser={currentUser} bloqueosPorFecha={bloqueosPorFecha} turnosExpirados={turnosExpirados} horarioLaboral={horarioLaboral} onVolver={volverAlCliente} onCancelarTurno={anularTurno} onReprogramarTurno={reprogramarTurno} turnosPendientes={turnosPendientes} turnosOcupados={turnosOcupados} horariosFijos={horariosFijos} />
      ) : (
        <Inicio horariosLibres={horariosLibres} profesionales={profesionales} profesionalActual={profesionalActual} servicioActual={servicioActual} diaActual={diaActual} nombreCliente={nombreCliente} telefonoCliente={telefonoCliente} bloqueosPorFecha={bloqueosPorFecha} horariosDelDia={horariosDelDia} horarioLaboral={horarioLaboral} aviso={aviso} registrarTurno={registrarTurno} cargandoDisponibilidad={cargandoDisponibilidad} proximosTurnos={proximosTurnos} cantidadOcupados={cantidadOcupados} onCerrarSesion={cerrarSesion} onVerMisTurnos={verMisTurnos} currentUser={currentUser} profesionalSeleccionado={profesionalSeleccionado} servicioSeleccionado={servicioSeleccionado} fechaSeleccionada={fechaSeleccionada} horaSeleccionada={horaSeleccionada} horaEstaOcupada={horaEstaOcupada} setNombreCliente={setNombreCliente} setTelefonoCliente={setTelefonoCliente} setProfesionalSeleccionado={setProfesionalSeleccionado} setServicioSeleccionado={setServicioSeleccionado} setFechaSeleccionada={cambiarFechaCalendario} setHoraSeleccionada={setHoraSeleccionada} servicios={servicios} enviando={enviando} horariosFijos={horariosFijos} horariosNoDisponibles={horariosNoDisponibles} turnosOcupados={turnosOcupados} diaCalendarMin={initialCalendarDate} diaCalendarMax={fechaAIso(calendarEnd)} />
      )}
      <WhatsApp />
    </>
  );
}
export default App;

//...