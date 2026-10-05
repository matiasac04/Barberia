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
//      (role: 'admin' o 'client') decide qué vista renderizar:
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
// REGLAS DE NEGOCIO (aplicadas aquí + en ayudantes.js):
//   - Domingos (0) y lunes (1): DÍAS CERRADOS (isBlockedWeekday).
//   - Ventana de reservas: ÚNICAMENTE desde HOY (00:00) hasta HOY + 30 DÍAS (23:59:59).
//   - Turnos de 30 minutos. Los slots disponibles salen del HorarioLaboral
//     del profesional (DB). Si NO tiene horario cargado, usa timeSlots
//     de respaldo (src/datos/semilla.js).
//   - Disponibilidad = slots del día − (turnos ocupados + bloqueos puntuales/día completo).
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
// Datos semilla (fallback de arranque, la DB es la fuente real):
import { timeSlots } from './datos/semilla';
// Funciones de la API (todas las llamadas al backend, ver src/servicios/api.js):
import { actualizarProfesional, actualizarServicio, actualizarTurno, cancelarTurno, crearProfesional, crearServicio, eliminarProfesional, eliminarServicio, eliminarTurno, guardarBloqueos, guardarHorarios, loginCliente, obtenerBloqueos, obtenerHorarios, obtenerProfesionales, obtenerServicios, obtenerTurnos, obtenerTurnosCliente, obtenerTurnosDisponibles, obtenerTurnosOcupados, registrarCliente, reservarTurno, verificarToken } from './servicios/api';
// Utilidades de fechas/slots/estados (ver src/utilidades/ayudantes.js):
import { canCancelBooking, formatCalendarLabel, getDateBlockedSlots, getWeekdayPattern, getWeeklySlots, isBlockedWeekday, resolveBookingStatus, resolveCalendarDetails, toIsoDate } from './utilidades/ayudantes';

// ── Constantes de calendario ─────────────────────────
// Ventana de reservas: de HOY (0:00) hasta HOY + 30 días (23:59:59).
// Tanto el turnero como el calendario mensual se limitan a este rango.
const today = new Date(), calendarStart = new Date(today), calendarEnd = new Date(today);
calendarStart.setHours(0, 0, 0, 0); calendarEnd.setDate(calendarEnd.getDate() + 30); calendarEnd.setHours(23, 59, 59, 999);
// Fecha inicial seleccionada en el turnero = hoy, en formato 'YYYY-MM-DD'
// (formato ISO sin hora, que es como espera el backend).
const initialCalendarDate = toIsoDate(calendarStart);

function App() {
  // ── Estado global ────────────────────────────────
  // -------------------------------------------------------------------
  // ESTADO DE SESIÓN
  //   mainView      → qué vista muestra el cliente: 'client' (turnero)
  //                   o 'my-bookings' (mis turnos)
  //   token         → el JWT del backend. Al arrancar se lee de localStorage
  //                   para que la sesión sobreviva al recargar la página.
  //   currentUser   → el usuario logueado: { role: 'admin'|'client', ... }
  //   isAuthenticated→ ¿hay token Y usuario? Si no → muestra el login.
  // -------------------------------------------------------------------
  const [mainView, setMainView] = useState('client');
  const [token, setToken] = useState(() => { try { return localStorage.getItem('token') ?? ''; } catch { return ''; } });
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null'); } catch { return null; } });
  const isAuthenticated = Boolean(token && currentUser);

  // Formulario de ingreso: pantalla activa ('login' | 'register') y sus campos
  const [authScreen, setAuthScreen] = useState('login');
  const [loginEmail, setLoginEmail] = useState(''); const [loginPassword, setLoginPassword] = useState('');
  const [registerForm, setRegisterForm] = useState({ firstName: '', lastName: '', email: '', password: '', whatsapp: '' });
  // Mensaje que se muestra en la pantalla de ingreso (idle/error/success)
  const [authFeedback, setAuthFeedback] = useState({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });

  // -------------------------------------------------------------------
  // CATÁLOGO (viene de la API / SQL Server)
  //   barbers   → profesionales ACTIVOS (los que puede elegir el cliente)
  //   allBarbers→ TODOS (activos + inactivos), para el panel de admin
  //   services  → el catálogo de servicios (corte, barba, etc.)
  // -------------------------------------------------------------------
  const [barbers, setBarbers] = useState([]);
  const [allBarbers, setAllBarbers] = useState([]);
  const [services, setServices] = useState([]);

  // -------------------------------------------------------------------
  // SELECCIÓN del turnero (el wizard del cliente)
  // Guarda lo que el usuario va eligiendo paso a paso: profesional,
  // servicio, fecha, hora, y sus datos de contacto para confirmar.
  // -------------------------------------------------------------------
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(initialCalendarDate);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [customerName, setCustomerName] = useState(''); const [customerPhone, setCustomerPhone] = useState('');

  // Turnos traídos de la API. Para el cliente son SOLO los suyos,
  // para el admin son TODOS los del negocio.
  const [confirmedBookings, setConfirmedBookings] = useState([]);

  // feedback: mensaje de éxito/error/idle en el turnero.
  // submitting: flag que evita el doble envío del formulario.
  const [feedback, setFeedback] = useState({ type: 'idle', message: 'Elegí profesional, día y horario para reservar.' });
  const [submitting, setSubmitting] = useState(false);

  // -------------------------------------------------------------------
  // DISPONIBILIDAD (lo que está ocupado / bloqueado)
  //   horariosOcupadosApi → horas ocupadas de la fecha+barbero elegidos
  //   loadingAvailability → spinner mientras se consulta a la API
  //   dateBlockouts       → bloqueos puntuales del admin (día o slot)
  //   horarioLaboral      → horario semanal por profesional (si está en DB)
  //   bookedRange         → TODOS los turnos ocupados de los próximos 30
  //                         días, para pintar el calendario mensual
  // -------------------------------------------------------------------
  const [horariosOcupadosApi, setHorariosOcupadosApi] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [dateBlockouts, setDateBlockouts] = useState([]);
  const [horarioLaboral, setHorarioLaboral] = useState([]);
  const [bookedRange, setBookedRange] = useState([]);
  // Qué pedido de la carga inicial falló, para no quedar en "Cargando datos..."
  // para siempre sin explicar por qué. Vacío = todo cargó bien.
  const [errorCarga, setErrorCarga] = useState('');

  // ── Sincronización de selección ───────────────────
  // Si el barbero o servicio seleccionado ya no existe en la lista
  // (por ejemplo al recargar datos), se vuelve a seleccionar el primero.
  useEffect(() => { if (barbers.length > 0 && !barbers.some((b) => b.id === selectedBarber)) setSelectedBarber(barbers[0].id); }, [barbers, selectedBarber]);
  useEffect(() => { if (services.length > 0 && !services.some((s) => s.id === selectedService)) setSelectedService(services[0].id); }, [selectedService, services]);
  // Pre-carga el nombre y teléfono del cliente logueado en el formulario
  useEffect(() => { setCustomerName(currentUser?.name ?? ''); setCustomerPhone(currentUser?.phone ?? ''); }, [currentUser]);

  // ── Sesión y autenticación ───────────────────────
  // Expulsa al usuario: limpia estado + localStorage y vuelve al login.
  // Se usa cuando el token expira o el backend responde 401 (sesión inválida).
  const expulsarPorSesion = useCallback(() => {
    setToken(''); setCurrentUser(null); setConfirmedBookings([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setAuthScreen('login'); setLoginEmail(''); setLoginPassword('');
    setAuthFeedback({ type: 'error', message: 'Tu sesión venció. Iniciá sesión de nuevo para continuar.' });
  }, []);

  // Al arrancar (y cada vez que cambia el token) le pregunta al backend
  // "¿este token sigue siendo válido?" (GET /verificar).
  // Si no lo es → expulsa. Los usuarios de Google se excluyen porque
  // su token 'mock-google' no es un JWT real del backend.
  useEffect(() => {
    let cancelado = false;
    if (!token || !currentUser || currentUser.provider === 'google') return;
    verificarToken(token)
      .then(() => { if (cancelado) return; setAuthFeedback({ type: 'success', message: currentUser.role === 'admin' ? 'Bienvenido administrador.' : `Sesión iniciada con ${currentUser.email}.` }); })
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
      if (Array.isArray(p) && p.length > 0) setBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
    } catch (error) { console.warn('No se pudieron obtener los profesionales:', error); }
  }, [token]);

  // Igual pero trae TODOS los profesionales (activos e inactivos) con su
  // flag `activo`. Lo usa el panel de admin para poder reactivar bajas.
  const cargarTodosProfesionales = useCallback(async () => {
    if (!token) return;
    try {
      const p = await obtenerProfesionales(token, true);
      if (Array.isArray(p)) setAllBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
    } catch (error) { console.warn('No se pudieron obtener todos los profesionales:', error); }
  }, [token]);

  // Trae el catálogo de servicios y lo mapea a { id, name, price, durationMinutes }.
  const cargarServicios = useCallback(async () => {
    try {
      const s = await obtenerServicios();
      if (Array.isArray(s) && s.length > 0) setServices(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
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
    Promise.allSettled([obtenerProfesionales(token), obtenerProfesionales(token, true), obtenerServicios(), obtenerBloqueos(token), obtenerHorarios(token), obtenerTurnosOcupados(initialCalendarDate, toIsoDate(calendarEnd), token)])
      .then(([rp, rpa, rs, rb, rh, ro]) => {
        if (cancelado) return;
        const fallidas = [];
        const p = valor(rp, 'profesionales') ?? (fallidas.push('profesionales'), null);
        const pa = valor(rpa, 'todos los profesionales') ?? (fallidas.push('todos los profesionales'), null);
        const s = valor(rs, 'servicios') ?? (fallidas.push('servicios'), null);
        const b = valor(rb, 'bloqueos') ?? (fallidas.push('bloqueos'), null);
        const h = valor(rh, 'horarios') ?? (fallidas.push('horarios'), null);
        const o = valor(ro, 'turnos ocupados') ?? (fallidas.push('turnos ocupados'), null);
        if (Array.isArray(p) && p.length > 0) setBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
        if (Array.isArray(pa)) setAllBarbers(pa.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
        if (Array.isArray(s) && s.length > 0) setServices(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
        if (Array.isArray(b)) setDateBlockouts(b);
        if (Array.isArray(h)) setHorarioLaboral(h);
        if (Array.isArray(o)) setBookedRange(o);
        setErrorCarga(fallidas.length ? `No se pudo cargar: ${fallidas.join(', ')}. Revisá que el backend esté corriendo.` : '');
      });
    return () => { cancelado = true; };
  }, [token]);

  // Vuelve a pedir todos los turnos ocupados del mes entero. Se usa después
  // de reservar/cancelar/reprogramar para refrescar el calendario mensual.
  const refrescarOcupados = useCallback(() => {
    if (!token) return;
    obtenerTurnosOcupados(initialCalendarDate, toIsoDate(calendarEnd), token)
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
  // canCancelBooking necesita la hora). Por eso, si algún día esto no puede
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
    if (!token || !selectedDate || !selectedBarber) return;  // falta sesión o falta elegir algo
    setLoadingAvailability(true);  // prende el spinner
    obtenerTurnosDisponibles(selectedDate, selectedBarber, token)
      .then((r) => setHorariosOcupadosApi((r?.turnosOcupados ?? []).map((t) => normalizarHoraApi(t.horaInicio)).filter(Boolean)))
      .catch(() => setHorariosOcupadosApi([]))
      .finally(() => setLoadingAvailability(false));  // siempre apaga el spinner
  }, [token, selectedDate, selectedBarber, normalizarHoraApi]);
  useEffect(() => { cargarDisponibilidad(); }, [cargarDisponibilidad]);

  // Trae los turnos del CLIENTE logueado y los convierte a un formato único
  // para la UI. `resolveBookingStatus` calcula en qué estado está cada turno
  // (pendiente / vencido / completado / cancelado / no-show) según su fecha,
  // hora y el momento actual.
  const cargarMisTurnos = useCallback(async () => {
    if (!currentUser?.idCliente || !token) return;
    try {
      const res = await obtenerTurnosCliente(currentUser.idCliente, token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setConfirmedBookings(lista.map((t) => {
        const fechaIso = toIsoDate(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const status = resolveBookingStatus(t.estado, fechaIso, hora);
        return { id: t.idTurno, ownerEmail: currentUser.email, barberId: t.idProfesional ?? null, barberName: t.profesional, serviceName: t.servicio, servicePrice: t.precioTotal, bookingDate: fechaIso, time: hora, customerName: currentUser.name, status, ...resolveCalendarDetails(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [currentUser, token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (isAuthenticated && currentUser?.role !== 'admin') cargarMisTurnos(); }, [isAuthenticated, cargarMisTurnos, currentUser?.role]);
  // Auto-refresco para el cliente: vuelve a cargar "Mis turnos" cada 20
  // segundos y al volver a la pestaña (visibilitychange). Así el estado de
  // un turno se actualiza solo (ej. de 'pendiente' a 'completado').
  useEffect(() => {
    if (!isAuthenticated || currentUser?.role === 'admin') return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargarMisTurnos(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargarMisTurnos(); }, 20000);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [isAuthenticated, currentUser?.role, cargarMisTurnos]);

  // Igual que cargarMisTurnos pero para el ADMIN: trae TODOS los turnos del
  // negocio con sus JOINs (nombre del cliente, del barbero y del servicio).
  const cargarTurnosAdmin = useCallback(async () => {
    if (!token) return;
    try {
      const res = await obtenerTurnos(token);
      const lista = Array.isArray(res) ? res : (res?.turnos ?? res?.data ?? []);
      if (!Array.isArray(lista)) return;
      setConfirmedBookings(lista.map((t) => {
        const fechaIso = toIsoDate(t.fecha), hora = normalizarHoraApi(t.horaInicio);
        const status = resolveBookingStatus(t.estado, fechaIso, hora);
        return { id: t.idTurno, idCliente: t.idCliente ?? null, ownerEmail: t.email ?? '', barberId: t.idProfesional ?? null, serviceId: t.idServicio ?? null, barberName: t.profesional, serviceName: t.servicio, servicePrice: t.precioTotal, bookingDate: fechaIso, time: hora, customerName: t.nombreCliente ?? '', customerPhone: t.telefono ?? '', status, ...resolveCalendarDetails(fechaIso) };
      }));
    } catch (error) { if (error?.status === 401) expulsarPorSesion(); }
  }, [token, expulsarPorSesion, normalizarHoraApi]);
  useEffect(() => { if (isAuthenticated && currentUser?.role === 'admin') cargarTurnosAdmin(); }, [isAuthenticated, cargarTurnosAdmin, currentUser?.role]);

  // ── Disponibilidad del día (slots libres/ocupados) ──
  // Construye el "mapa de ocupación": { [idBarbero]: { 'YYYY-MM-DD': ['10:30', ...] } }
  // combinando el rango del calendario mensual (bookedRange) con los turnos
  // ya cargados (confirmedBookings). `meter()` agrega una hora al mapa.
  const takenSlots = useMemo(() => {
    const snap = {};  // el mapa arranca vacío; lo llenan los turnos de abajo
    const meter = (barberId, dayKey, time) => {  // marca una hora como ocupada
      if (barberId == null || dayKey == null || !time) return;
      const bs = snap[barberId] ?? (snap[barberId] = {});
      bs[dayKey] = [...(bs[dayKey] ?? []), time];
    };
    bookedRange.forEach((t) => {
      const hora = normalizarHoraApi(t.horaInicio);
      if (!hora) return;
      meter(t.idProfesional, toIsoDate(t.fecha), hora);
    });
    confirmedBookings.forEach((b) => meter(b.barberId, toIsoDate(b.bookingDate), b.time));
    return snap;
  }, [bookedRange, confirmedBookings, normalizarHoraApi]);

  // ── Datos derivados del día seleccionado ──────────
  const currentBarber = barbers.find((b) => b.id === selectedBarber) ?? barbers[0] ?? null;
  const currentService = services.find((s) => s.id === selectedService) ?? services[0] ?? null;
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedWeekdayPattern = getWeekdayPattern(selectedDateObject);  // 'weekday' | 'saturday' | null
  const selectedDateLabel = formatCalendarLabel(selectedDateObject);     // { label, date }
  const currentDay = { id: selectedWeekdayPattern ?? 'sun', label: selectedDateLabel.label, date: selectedDateLabel.date };
  // Slots posibles del día: usa el horario laboral si existe en la DB,
  // si no, cae en el horario fijo de respaldo (timeSlots de semilla.js)
  const daySlots = selectedWeekdayPattern ? getWeeklySlots(horarioLaboral, selectedBarber, selectedWeekdayPattern, timeSlots) : [];
  // Lo bloqueado = turnos ya tomados + bloqueos puntuales que cargó el admin
  const horariosBloqueadosLocales = selectedWeekdayPattern ? [...(takenSlots[selectedBarber]?.[selectedDate] ?? []), ...getDateBlockedSlots(dateBlockouts, selectedBarber, selectedDate, daySlots)] : daySlots;
  const unavailableSlots = [...new Set([...horariosBloqueadosLocales, ...horariosOcupadosApi])];  // sin duplicados
  // DISPONIBLES = todos los slots del día − los no disponibles
  const availableSlots = daySlots.filter((s) => !unavailableSlots.includes(s));
  // Auto-ajuste de la hora elegida: si no quedan slots la limpia; si el
  // slot elegido dejó de estar disponible, elige el primero libre.
  useEffect(() => { if (availableSlots.length === 0) { setSelectedTime(''); return; } if (!availableSlots.includes(selectedTime)) setSelectedTime(availableSlots[0]); }, [availableSlots, selectedTime]);
  const selectedTimeIsTaken = selectedTime ? unavailableSlots.includes(selectedTime) : true;
  // Reglas de negocio aplicadas al día seleccionado:
  const isSundayOrMonday = isBlockedWeekday(selectedDateObject.getDay());  // ¿cerrado ese día?
  const isOutOfRange = selectedDateObject < calendarStart || selectedDateObject > calendarEnd;  // ¿fuera de hoy +30?

  // ── Selección de fecha (validaciones) ──────────────
  // Se ejecuta al tocar un día del calendario. Valida: fecha válida,
  // dentro del rango [hoy, +30 días] y que no sea domingo/lunes.
  // Si algo falla, muestra el error y NO cambia la fecha seleccionada.
  const handleCalendarChange = (nextDate) => {
    const nextDateObject = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(nextDateObject.getTime())) return;
    if (nextDateObject < calendarStart || nextDateObject > calendarEnd) { setFeedback({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (isBlockedWeekday(nextDateObject.getDay())) { setFeedback({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    setSelectedDate(nextDate);
  };

  // ── Handlers de sesión (logout, login, registro, Google) ──
  // Logout: limpia estado + localStorage y vuelve a la pantalla de login.
  const handleLogout = () => {
    setToken(''); setCurrentUser(null); setConfirmedBookings([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setMainView('client'); setAuthScreen('login'); setLoginEmail(''); setLoginPassword('');
    setRegisterForm({ firstName: '', lastName: '', email: '', password: '', whatsapp: '' });
    setAuthFeedback({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });
  };

  // Login: manda usuario/mail + contraseña a POST /login. Según el `role`
  // que devuelva el backend arma un currentUser distinto:
  //   - admin  → { role: 'admin', ... } → vista de administración
  //   - client → { role: 'client', ... } → turnero
  // En ambos casos guarda token + usuario en localStorage.
  const handleLoginSubmit = async (event) => {
    event.preventDefault();
    const cred = loginEmail.trim(), pass = loginPassword.trim();
    if (!cred || !pass) { setAuthFeedback({ type: 'error', message: 'Completá usuario/mail y contraseña para iniciar sesión.' }); return; }
    try {
      setAuthFeedback({ type: 'idle', message: 'Iniciando sesión...' });
      const r = await loginCliente(cred, pass);
      if (r?.role === 'admin') {
        const admin = { idCliente: null, idAdmin: r.admin?.idAdmin ?? null, name: r.admin?.nombre ?? 'Administrador', email: r.admin?.email ?? cred, role: 'admin' };
        setToken(r.token); setCurrentUser(admin);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(admin)); } catch {}
        setMainView('admin'); setAuthFeedback({ type: 'success', message: 'Acceso de administrador habilitado.' });
      } else {
        const u = { idCliente: r.cliente?.idCliente ?? null, name: r.cliente?.nombre ?? cred.split('@')[0], email: cred, role: 'client', phone: r.cliente?.telefono ?? '' };
        setToken(r.token); setCurrentUser(u);
        try { localStorage.setItem('token', r.token); localStorage.setItem('currentUser', JSON.stringify(u)); } catch {}
        setMainView('client'); setAuthFeedback({ type: 'success', message: `Sesión iniciada con ${cred}.` });
      }
    } catch (error) { setAuthFeedback({ type: 'error', message: error.message || 'Credenciales incorrectas.' }); }
  };

  // ⚠️ "Continuar con Google" es SOLO un mock de prueba: crea un usuario
  // falso (sin idCliente en la DB) con un token inválido 'mock-google'.
  // Ese usuario NO puede reservar turnos (ver handleSubmit, valida idCliente).
  const handleGoogleLogin = () => {
    const mock = { idCliente: null, name: 'Cliente Prueba', email: 'cliente.prueba@gmail.com', role: 'client', phone: '', provider: 'google' };
    const t = 'mock-google';
    setToken(t); setCurrentUser(mock); setMainView('client'); setAuthScreen('login');
    try { localStorage.setItem('token', t); localStorage.setItem('currentUser', JSON.stringify(mock)); } catch {}
    setAuthFeedback({ type: 'success', message: 'Sesión iniciada con Google (modo prueba).' });
  };

  // Registro: crea la cuenta en la DB (POST /registro), vuelve a la pantalla
  // de login y pre-carga el mail para que el usuario solo escriba la clave.
  const handleRegisterSubmit = async (event) => {
    event.preventDefault(); const { firstName, lastName, email, password, whatsapp } = registerForm;
    if (!firstName.trim() || !lastName.trim() || !email.trim() || !password.trim() || !whatsapp.trim()) { setAuthFeedback({ type: 'error', message: 'Completá nombre, apellido, mail, contraseña y whatsapp para registrarte.' }); return; }
    try {
      setAuthFeedback({ type: 'idle', message: 'Creando tu cuenta...' });
      await registrarCliente({ nombre: firstName.trim(), apellido: lastName.trim(), email: email.trim(), telefono: whatsapp.trim(), password });
      setAuthScreen('login'); setLoginEmail(email.trim()); setLoginPassword('');
      setAuthFeedback({ type: 'success', message: `¡Cuenta creada! Ya podés iniciar sesión con ${email.trim()}.` });
    } catch (error) { setAuthFeedback({ type: 'error', message: error.message || 'Error al registrar el cliente.' }); }
  };

  // ── Reserva de turno ───────────────────────────────
  // Es el paso final del turnero. Re-valida todo por las dudas
  // (nombre+teléfono, cuenta vinculada a la DB, día habilitado, hora libre),
  // llama a POST /turnos y después refresca la disponibilidad y los turnos.
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) { setFeedback({ type: 'error', message: 'Completá tu nombre y teléfono para confirmar el turno.' }); return; }
    if (!currentUser?.idCliente) { setFeedback({ type: 'error', message: 'Tu cuenta no está vinculada a un cliente de la base. Iniciá sesión con tu cuenta registrada.' }); return; }
    if (isSundayOrMonday) { setFeedback({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    if (isOutOfRange) { setFeedback({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (!selectedTime || selectedTimeIsTaken) { setFeedback({ type: 'error', message: 'Elegí un horario disponible antes de confirmar.' }); return; }
    if (submitting) return;  // evita el doble envío con el botón
    try {
      setSubmitting(true);
      setFeedback({ type: 'idle', message: 'Confirmando tu turno...' });
      await reservarTurno({ idCliente: currentUser.idCliente, idProfesional: selectedBarber, idServicio: selectedService, fecha: selectedDate, horaInicio: selectedTime, telefono: customerPhone.trim() }, token);
      setFeedback({ type: 'success', message: `Turno confirmado para ${customerName.trim()} con ${currentBarber.name} (${currentService.name}, $${currentService.price.toLocaleString('es-AR')}) el ${selectedDateLabel.label} ${selectedDateLabel.date} a las ${selectedTime}.` });
      setCustomerName(currentUser?.name ?? ''); setCustomerPhone(currentUser?.phone ?? ''); setSelectedTime('');
      // Refresca todo lo afectado por la nueva reserva:
      cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos();
    } catch (error) { setFeedback({ type: 'error', message: error.message || 'Error al reservar el turno.' }); }
    finally { setSubmitting(false); }  // siempre desbloquea el botón
  };

  // ── Datos derivados para vista del cliente ─────────
  const occupancyCount = daySlots.length - availableSlots.length;  // cuántos slots del día están ocupados
  const currentUserEmail = currentUser?.email ?? '';
  // Turnos del cliente logueado = los confirmadoBookings que son SUYOS
  //
  // OJO con el orden: la API los trae como `ORDER BY fecha DESC` (el más nuevo
  // primero), y pendingBookings/expiredBookings heredan ese orden. Sin este
  // sort, "el próximo turno" del banner era el MÁS LEJANO y la lista de
  // pendientes salía al revés. Se ordena por fecha + hora ascendente.
  const currentUserBookings = useMemo(
    () => confirmedBookings.filter((b) => b.ownerEmail === currentUserEmail).slice().sort((l, r) => `${l.bookingDate}T${l.time}`.localeCompare(`${r.bookingDate}T${r.time}`)),
    [confirmedBookings, currentUserEmail]
  );
  // pending = próximos / expired = pasados (según resolveBookingStatus)
  const pendingBookings = currentUserBookings.filter((b) => b.status === 'pending');
  const expiredBookings = currentUserBookings.filter((b) => b.status === 'expired'); const nextBookings = pendingBookings.slice(0, 3);  // los 3 próximos para el banner

  // ── Cancelar y reprogramar turno (cliente) ─────────
  // Cancela el turno en la DB (estado → 'Cancelado') previa confirmación.
  // La regla de las >24 h de antelación la valida canCancelBooking.js.
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('¿Seguro que querés cancelar este turno?')) return;
    try { await cancelarTurno(bookingId, token); setFeedback({ type: 'success', message: 'Turno cancelado correctamente.' }); cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos(); }
    catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al cancelar el turno.' }); }
  };

  // Reprograma: cambia fecha y/o hora con un PATCH a la API y actualiza en
  // local el turno con sus datos de calendario recalculados.
  const handleRescheduleBooking = async (bookingId, bookingDate, time) => {
    if (!window.confirm('¿Confirmás el nuevo día y horario?')) return;
    try {
      setFeedback({ type: 'idle', message: 'Reprogramando tu turno...' });
      await actualizarTurno(bookingId, { fecha: bookingDate, horaInicio: time }, token);
      setConfirmedBookings((p) => p.map((b) => (b.id === bookingId ? { ...b, bookingDate, time, ...resolveCalendarDetails(bookingDate) } : b)));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarMisTurnos();
      setFeedback({ type: 'success', message: 'Turno reprogramado correctamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setFeedback({ type: 'error', message: error.message || 'Error al reprogramar el turno.' });
    }
  };

  // ── CRUD profesionales (agregar, actualizar, eliminar) ──
  // Divide 'Juan Pérez' → { nombre: 'Juan', apellido: 'Pérez' }
  // porque en la DB el nombre y el apellido son campos separados.
  const diviProfesionalNombre = (nombreCompleto) => {
    const partes = String(nombreCompleto).trim().split(/\s+/);
    return { nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
  };
  // Alta: crea el profesional, recarga las 2 listas y devuelve { ok }
  // para que el modal se cierre automáticamente si salió bien.
  const handleAddBarber = async (nombreCompleto, email, telefono) => {
    const { nombre, apellido } = diviProfesionalNombre(nombreCompleto);
    try {
      await crearProfesional({ nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al agregar el profesional.' }; }
  };
  // Edita un profesional (misma lógica que el alta).
  const handleUpdateBarber = async (id, nombreCompleto, email, telefono) => {
    const { nombre, apellido } = diviProfesionalNombre(nombreCompleto);
    try {
      await actualizarProfesional(id, { nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al actualizar el profesional.' }; }
  };
  // Baja lógica (activo → 0): los turnos pasados se mantienen, pero ya no
  // recibe reservas nuevas.
  const handleDeleteBarber = async (id) => {
    if (!window.confirm('¿Eliminar a este profesional? Sus turnos se mantienen, pero ya no recibirá reservas nuevas.')) return { ok: false };
    try {
      await eliminarProfesional(id, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al eliminar el profesional.' }; }
  };
  // Activar / desactivar (toggle del checkbox en el panel de admin).
  const handleToggleBarberActivo = async (id, activo) => {
    try {
      await actualizarProfesional(id, { activo: !activo }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al cambiar el estado del profesional.' }); return false; }
  };

  // ── CRUD servicios (agregar, actualizar, eliminar) ──
  // Los tres devuelven true/false para que el modal cierre o muestre error.
  const handleAddService = async (name, price, durationMinutes) => {
    try {
      await crearServicio({ nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al agregar el servicio.' }); return false; }
  };
  const handleUpdateService = async (id, name, price, durationMinutes) => {
    try {
      await actualizarServicio(id, { nombre: name, precio: price, duracion_minutos: durationMinutes }, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al actualizar el servicio.' }); return false; }
  };
  // Borrado físico. Si el servicio tiene turnos asociados, el backend
  // responde error 547 (FK de SQL Server) y acá se muestra el aviso.
  const handleDeleteService = async (id) => {
    if (!window.confirm('¿Eliminar este servicio del catálogo?')) return false;
    try {
      await eliminarServicio(id, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al eliminar el servicio.' }); return false; }
  };

  // ── Guardar bloqueos y horarios laborales ──────────
  // Guarda los bloqueos del admin y RECARGA la lista desde la API para que
  // el calendario del cliente refleje el cambio al instante.
  const handleSaveDateBlockouts = useCallback(async (barberId, fecha, body) => {
    try {
      await guardarBloqueos(barberId, { fecha, ...body }, token);
      const b = await obtenerBloqueos(token);
      if (Array.isArray(b)) setDateBlockouts(b);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);
  // Igual que el anterior pero para el horario SEMANAL del profesional
  // (hasta 2 bloques por día). También recarga para reflejar el cambio.
  const handleSaveHorarios = useCallback(async (barberId, horarios) => {
    try {
      await guardarHorarios(barberId, horarios, token);
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
  const handleUpdateBooking = async (bookingId, updates) => {
    try {
      setFeedback({ type: 'idle', message: 'Guardando el turno...' });
      await actualizarTurno(bookingId, {
        idProfesional: updates.barberId ? Number(updates.barberId) : undefined,
        idServicio: updates.serviceId ? Number(updates.serviceId) : undefined,
        fecha: updates.bookingDate || undefined,
        horaInicio: updates.time || undefined,
        // 'confirmed' ya no se manda: no es un estado real (ver bookingStatusOptions
        // en Admin.jsx). Los valores válidos son los que mapea mapaEstado() del
        // backend a las columnas de la DB.
        estado: ['pending', 'completed', 'no-show', 'cancelled'].includes(updates.status) ? updates.status : undefined,
        nombreCliente: updates.customerName !== undefined ? updates.customerName : undefined,
        telefono: updates.customerPhone,
      }, token);
      setConfirmedBookings((p) => p.map((b) => { if (b.id !== bookingId) return b; const nb = barbers.find((x) => x.id === Number(updates.barberId)) ?? barbers[0]; const ns = services.find((x) => x.id === Number(updates.serviceId)) ?? services[0]; return { ...b, ...updates, barberId: updates.barberId != null ? Number(updates.barberId) : b.barberId, barberName: nb?.name ?? b.barberName, serviceName: ns?.name ?? b.serviceName, servicePrice: ns?.price ?? b.servicePrice, ...resolveCalendarDetails(updates.bookingDate) }; }));
      await cargarTurnosAdmin(); refrescarOcupados();
      setFeedback({ type: 'success', message: 'Turno actualizado en la base de datos.' });
      return true;
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setFeedback({ type: 'error', message: error.message || 'Error al actualizar el turno.' });
      return false;
    }
  };
  // Borrado definitivo del turno (delete físico en la DB, con confirmación).
  const handleDeleteBooking = async (bookingId) => {
    if (!window.confirm('¿Eliminar este turno definitivamente?')) return;
    try {
      await eliminarTurno(bookingId, token);
      setConfirmedBookings((p) => p.filter((b) => b.id !== bookingId));
      cargarDisponibilidad(); refrescarOcupados();
      await cargarTurnosAdmin();
      setFeedback({ type: 'success', message: 'Turno eliminado definitivamente.' });
    } catch (error) {
      if (error.status === 401) expulsarPorSesion();
      else setFeedback({ type: 'error', message: error.message || 'Error al eliminar el turno.' });
    }
  };
  // ── Navegación entre vistas (cliente, mis turnos) ──
  // Cambia la vista del cliente usando el hash de la URL (#mis-turnos).
  // history.pushState permite que el botón atrás del navegador funcione.
  const handleShowMyBookings = () => { setMainView('my-bookings'); try { history.pushState({ view: 'my-bookings' }, '', '#mis-turnos'); } catch {} };
  const handleBackToClient = () => { setMainView('client'); try { history.pushState({ view: 'client' }, '', window.location.pathname); } catch {} };

  // Escucha el evento 'popstate' (botón atrás/adelante del navegador) y
  // sincroniza la vista con el hash actual de la URL.
  useEffect(() => {
    const onPop = () => {
      const isMyBookings = window.location.hash === '#mis-turnos';
      setMainView(isMyBookings ? 'my-bookings' : 'client');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Render de pantallas ────────────────────────────
  // 1) SIN SESIÓN  → IniciarSesion (login/registro) + botón WhatsApp.
  // 2) CLIENTE (y aún cargando datos) → pantalla "Cargando datos...".
  // 3) ADMIN       → Admin.jsx con todos los handlers del panel.
  // 4) CLIENTE     → 'my-bookings' → MisTurnos (historial y cancelación)
  //                  → 'client'     → Inicio (el turnero de 5 pasos)
  if (!isAuthenticated) return (
    <>
      <IniciarSesion authScreen={authScreen} authFeedback={authFeedback} handleGoogleLogin={handleGoogleLogin} handleLoginSubmit={handleLoginSubmit} handleRegisterSubmit={handleRegisterSubmit} loginEmail={loginEmail} loginPassword={loginPassword} onShowLogin={() => setAuthScreen('login')} onShowRegister={() => setAuthScreen('register')} registerForm={registerForm} setLoginEmail={setLoginEmail} setLoginPassword={setLoginPassword} setRegisterForm={setRegisterForm} />
      <WhatsApp />
    </>
  );
  // Mientras no lleguen los profesionales y servicios, mostramos un loading
  // (así el turnero no aparece vacío/roto en el primer render). Si alguna
  // request falló, mostramos cuál fue en vez de quedarnos girando en silencio.
  if (currentUser?.role !== 'admin' && (barbers.length === 0 || services.length === 0)) return (
    <main className="simple-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100svh' }}>
      <p style={{ color: errorCarga ? 'var(--err)' : 'var(--text-mid)' }}>{errorCarga || 'Cargando datos...'}</p>
    </main>
  );
  return (
    <>
      {currentUser?.role === 'admin' ? (
        <Admin allBarbers={allBarbers} barbers={barbers} bookings={confirmedBookings} currentUser={currentUser} dateBlockouts={dateBlockouts} errorCarga={errorCarga} horarioLaboral={horarioLaboral} onAddBarber={handleAddBarber} onAddService={handleAddService} onDeleteBarber={handleDeleteBarber} onDeleteBooking={handleDeleteBooking} onDeleteService={handleDeleteService} onLogout={handleLogout} onSaveDateBlockouts={handleSaveDateBlockouts} onSaveHorarios={handleSaveHorarios} onToggleBarberActivo={handleToggleBarberActivo} onUpdateBarber={handleUpdateBarber} onUpdateBooking={handleUpdateBooking} onUpdateService={handleUpdateService} services={services} timeSlots={timeSlots} />
      ) : mainView === 'my-bookings' ? (
        <MisTurnos calendarMax={toIsoDate(calendarEnd)} calendarMin={initialCalendarDate} canCancelBooking={canCancelBooking} currentUser={currentUser} dateBlockouts={dateBlockouts} expiredBookings={expiredBookings} horarioLaboral={horarioLaboral} onBack={handleBackToClient} onCancelBooking={handleCancelBooking} onReschedule={handleRescheduleBooking} pendingBookings={pendingBookings} takenSlots={takenSlots} timeSlots={timeSlots} />
      ) : (
        <Inicio availableSlots={availableSlots} barbers={barbers} currentBarber={currentBarber} currentService={currentService} currentDay={currentDay} customerName={customerName} customerPhone={customerPhone} dateBlockouts={dateBlockouts} daySlots={daySlots} horarioLaboral={horarioLaboral} feedback={feedback} handleSubmit={handleSubmit} loadingAvailability={loadingAvailability} nextBookings={nextBookings} occupancyCount={occupancyCount} onLogout={handleLogout} onShowMyBookings={handleShowMyBookings} currentUser={currentUser} selectedBarber={selectedBarber} selectedService={selectedService} selectedDate={selectedDate} selectedTime={selectedTime} selectedTimeIsTaken={selectedTimeIsTaken} setCustomerName={setCustomerName} setCustomerPhone={setCustomerPhone} setSelectedBarber={setSelectedBarber} setSelectedService={setSelectedService} setSelectedDate={handleCalendarChange} setSelectedTime={setSelectedTime} services={services} submitting={submitting} timeSlots={timeSlots} unavailableSlots={unavailableSlots} takenSlots={takenSlots} dayCalendarMin={initialCalendarDate} dayCalendarMax={toIsoDate(calendarEnd)} />
      )}
      <WhatsApp />
    </>
  );
}
export default App;
