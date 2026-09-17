// ── Imports ──────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react';
import './App.css';
import Admin from './components/admin/Admin';
import Inicio from './components/cliente/Inicio';
import IniciarSesion from './components/ingreso/IniciarSesion';
import MisTurnos from './components/cliente/MisTurnos';
import WhatsApp from './components/comunes/WhatsApp';
import { initialTakenSlots, timeSlots } from './datos/semilla';
import { actualizarProfesional, actualizarServicio, actualizarTurno, cancelarTurno, crearProfesional, crearServicio, eliminarProfesional, eliminarServicio, eliminarTurno, guardarBloqueos, guardarHorarios, loginCliente, obtenerBloqueos, obtenerHorarios, obtenerProfesionales, obtenerServicios, obtenerTurnos, obtenerTurnosCliente, obtenerTurnosDisponibles, obtenerTurnosOcupados, registrarCliente, reservarTurno, verificarToken } from './servicios/api';
import { canCancelBooking, formatCalendarLabel, getDateBlockedSlots, getWeekdayPattern, getWeeklySlots, isBlockedWeekday, resolveBookingStatus, resolveCalendarDetails, safeClone, toIsoDate } from './utilidades/ayudantes';

// ── Constantes de calendario ─────────────────────────
const today = new Date(), calendarStart = new Date(today), calendarEnd = new Date(today);
calendarStart.setHours(0, 0, 0, 0); calendarEnd.setDate(calendarEnd.getDate() + 30); calendarEnd.setHours(23, 59, 59, 999);
const initialCalendarDate = toIsoDate(calendarStart);

function App() {
  // ── Estado global ────────────────────────────────
  const [mainView, setMainView] = useState('client');
  const [token, setToken] = useState(() => { try { return localStorage.getItem('token') ?? ''; } catch { return ''; } });
  const [currentUser, setCurrentUser] = useState(() => { try { return JSON.parse(localStorage.getItem('currentUser') ?? 'null'); } catch { return null; } });
  const isAuthenticated = Boolean(token && currentUser);
  const [authScreen, setAuthScreen] = useState('login');
  const [loginEmail, setLoginEmail] = useState(''); const [loginPassword, setLoginPassword] = useState('');
  const [registerForm, setRegisterForm] = useState({ firstName: '', lastName: '', email: '', password: '', whatsapp: '' });
  const [authFeedback, setAuthFeedback] = useState({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });
  const [barbers, setBarbers] = useState([]);
  const [allBarbers, setAllBarbers] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedBarber, setSelectedBarber] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(initialCalendarDate);
  const [selectedTime, setSelectedTime] = useState('09:00');
  const [customerName, setCustomerName] = useState(''); const [customerPhone, setCustomerPhone] = useState('');
  const [confirmedBookings, setConfirmedBookings] = useState([]);
  const [feedback, setFeedback] = useState({ type: 'idle', message: 'Elegí profesional, día y horario para reservar.' });
  const [submitting, setSubmitting] = useState(false);
  const [horariosOcupadosApi, setHorariosOcupadosApi] = useState([]);
  const [loadingAvailability, setLoadingAvailability] = useState(true);
  const [dateBlockouts, setDateBlockouts] = useState([]);
  const [horarioLaboral, setHorarioLaboral] = useState([]);
  const [bookedRange, setBookedRange] = useState([]);

  // ── Sincronización de selección ───────────────────
  useEffect(() => { if (barbers.length > 0 && !barbers.some((b) => b.id === selectedBarber)) setSelectedBarber(barbers[0].id); }, [barbers, selectedBarber]);
  useEffect(() => { if (services.length > 0 && !services.some((s) => s.id === selectedService)) setSelectedService(services[0].id); }, [selectedService, services]);
  useEffect(() => { setCustomerName(currentUser?.name ?? ''); setCustomerPhone(currentUser?.phone ?? ''); }, [currentUser]);

  // ── Sesión y autenticación ───────────────────────
  const expulsarPorSesion = useCallback(() => {
    setToken(''); setCurrentUser(null); setConfirmedBookings([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setAuthScreen('login'); setLoginEmail(''); setLoginPassword('');
    setAuthFeedback({ type: 'error', message: 'Tu sesión venció. Iniciá sesión de nuevo para continuar.' });
  }, []);

  useEffect(() => {
    let cancelado = false;
    if (!token || !currentUser || currentUser.provider === 'google') return;
    verificarToken(token)
      .then(() => { if (cancelado) return; setAuthFeedback({ type: 'success', message: currentUser.role === 'admin' ? 'Bienvenido administrador.' : `Sesión iniciada con ${currentUser.email}.` }); })
      .catch(() => { if (!cancelado) expulsarPorSesion(); });
    return () => { cancelado = true; };
  }, [token, currentUser, expulsarPorSesion]);

  // ── Carga de datos desde la API ───────────────────
  const cargarProfesionales = useCallback(async () => {
    try {
      const p = await obtenerProfesionales();
      if (Array.isArray(p) && p.length > 0) setBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' })));
    } catch {}
  }, []);

  const cargarTodosProfesionales = useCallback(async () => {
    try {
      const p = await obtenerProfesionales(true);
      if (Array.isArray(p)) setAllBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false })));
    } catch {}
  }, []);

  const cargarServicios = useCallback(async () => {
    try {
      const s = await obtenerServicios();
      if (Array.isArray(s) && s.length > 0) setServices(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos })));
    } catch {}
  }, []);

  // ── Carga inicial de datos (Profesionales/Servicios/Bloqueos/Horarios) ──
  useEffect(() => {
    let cancelado = false;
    Promise.all([obtenerProfesionales(), obtenerProfesionales(true), obtenerServicios(), obtenerBloqueos(), obtenerHorarios(), obtenerTurnosOcupados(initialCalendarDate, toIsoDate(calendarEnd))])
      .then(([p, pa, s, b, h, o]) => { if (cancelado) return; if (Array.isArray(p) && p.length > 0) setBarbers(p.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '' }))); if (Array.isArray(pa)) setAllBarbers(pa.map((x) => ({ id: x.idProfesional, name: String(x.nombre).trim(), email: x.email ?? '', telefono: x.telefono ?? '', activo: x.activo !== false }))); if (Array.isArray(s) && s.length > 0) setServices(s.map((x) => ({ id: x.idServicio, name: x.nombre, price: x.precio, durationMinutes: x.duracion_minutos }))); if (Array.isArray(b)) setDateBlockouts(b); if (Array.isArray(h)) setHorarioLaboral(h); if (Array.isArray(o)) setBookedRange(o); })
      .catch(() => {});
    return () => { cancelado = true; };
  }, []);

  const refrescarOcupados = useCallback(() => {
    obtenerTurnosOcupados(initialCalendarDate, toIsoDate(calendarEnd))
      .then((o) => { if (Array.isArray(o)) setBookedRange(o); })
      .catch(() => {});
  }, []);

  const normalizarHoraApi = useCallback((valor) => {
    if (!valor) return '';
    const s = String(valor).trim();
    const hhmmss = s.includes('T') ? s.split('T')[1].replace('Z', '') : s;
    const p = hhmmss.slice(0, 8).split(':');
    return p[1] ? `${p[0].padStart(2, '0')}:${p[1].padStart(2, '0')}` : '';
  }, []);

  const cargarDisponibilidad = useCallback(() => {
    if (!selectedDate || !selectedBarber) return;
    setLoadingAvailability(true);
    obtenerTurnosDisponibles(selectedDate, selectedBarber)
      .then((r) => setHorariosOcupadosApi((r?.turnosOcupados ?? []).map((t) => normalizarHoraApi(t.horaInicio)).filter(Boolean)))
      .catch(() => setHorariosOcupadosApi([]))
      .finally(() => setLoadingAvailability(false));
  }, [selectedDate, selectedBarber, normalizarHoraApi]);
  useEffect(() => { cargarDisponibilidad(); }, [cargarDisponibilidad]);

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
  useEffect(() => {
    if (!isAuthenticated || currentUser?.role === 'admin') return;
    const onVisible = () => { if (document.visibilityState === 'visible') cargarMisTurnos(); };
    document.addEventListener('visibilitychange', onVisible);
    const id = setInterval(() => { if (document.visibilityState === 'visible') cargarMisTurnos(); }, 20000);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [isAuthenticated, currentUser?.role, cargarMisTurnos]);

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
  const takenSlots = useMemo(() => {
    const snap = safeClone(initialTakenSlots);
    const meter = (barberId, dayKey, time) => {
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
  const currentBarber = barbers.find((b) => b.id === selectedBarber) ?? barbers[0] ?? null;
  const currentService = services.find((s) => s.id === selectedService) ?? services[0] ?? null;
  const selectedDateObject = new Date(`${selectedDate}T00:00:00`);
  const selectedWeekdayPattern = getWeekdayPattern(selectedDateObject);
  const selectedDateLabel = formatCalendarLabel(selectedDateObject);
  const currentDay = { id: selectedWeekdayPattern ?? 'sun', label: selectedDateLabel.label, date: selectedDateLabel.date };
  const daySlots = selectedWeekdayPattern ? getWeeklySlots(horarioLaboral, selectedBarber, selectedWeekdayPattern, timeSlots) : [];
  const horariosBloqueadosLocales = selectedWeekdayPattern ? [...(takenSlots[selectedBarber]?.[selectedDate] ?? []), ...getDateBlockedSlots(dateBlockouts, selectedBarber, selectedDate, daySlots)] : daySlots;
  const unavailableSlots = [...new Set([...horariosBloqueadosLocales, ...horariosOcupadosApi])];
  const availableSlots = daySlots.filter((s) => !unavailableSlots.includes(s));
  useEffect(() => { if (availableSlots.length === 0) { setSelectedTime(''); return; } if (!availableSlots.includes(selectedTime)) setSelectedTime(availableSlots[0]); }, [availableSlots, selectedTime]);
  const selectedTimeIsTaken = selectedTime ? unavailableSlots.includes(selectedTime) : true;
  const isSundayOrMonday = isBlockedWeekday(selectedDateObject.getDay());
  const isOutOfRange = selectedDateObject < calendarStart || selectedDateObject > calendarEnd;

  // ── Selección de fecha (validaciones) ──────────────
  const handleCalendarChange = (nextDate) => {
    const nextDateObject = new Date(`${nextDate}T00:00:00`);
    if (Number.isNaN(nextDateObject.getTime())) return;
    if (nextDateObject < calendarStart || nextDateObject > calendarEnd) { setFeedback({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (isBlockedWeekday(nextDateObject.getDay())) { setFeedback({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    setSelectedDate(nextDate);
  };

  // ── Handlers de sesión (logout, login, registro, Google) ──
  const handleLogout = () => {
    setToken(''); setCurrentUser(null); setConfirmedBookings([]);
    try { localStorage.removeItem('token'); localStorage.removeItem('currentUser'); history.replaceState(null, '', window.location.pathname); } catch {}
    setMainView('client'); setAuthScreen('login'); setLoginEmail(''); setLoginPassword('');
    setRegisterForm({ firstName: '', lastName: '', email: '', password: '', whatsapp: '' });
    setAuthFeedback({ type: 'idle', message: 'Primero iniciá sesión para acceder al turnero.' });
  };

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

  const handleGoogleLogin = () => {
    const mock = { idCliente: null, name: 'Cliente Prueba', email: 'cliente.prueba@gmail.com', role: 'client', phone: '', provider: 'google' };
    const t = 'mock-google';
    setToken(t); setCurrentUser(mock); setMainView('client'); setAuthScreen('login');
    try { localStorage.setItem('token', t); localStorage.setItem('currentUser', JSON.stringify(mock)); } catch {}
    setAuthFeedback({ type: 'success', message: 'Sesión iniciada con Google (modo prueba).' });
  };

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
  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) { setFeedback({ type: 'error', message: 'Completá tu nombre y teléfono para confirmar el turno.' }); return; }
    if (!currentUser?.idCliente) { setFeedback({ type: 'error', message: 'Tu cuenta no está vinculada a un cliente de la base. Iniciá sesión con tu cuenta registrada.' }); return; }
    if (isSundayOrMonday) { setFeedback({ type: 'error', message: 'No se pueden pedir turnos los domingos ni los lunes. Elegí de martes a sábado.' }); return; }
    if (isOutOfRange) { setFeedback({ type: 'error', message: 'Solo se pueden pedir turnos desde hoy hasta dentro de un mes.' }); return; }
    if (!selectedTime || selectedTimeIsTaken) { setFeedback({ type: 'error', message: 'Elegí un horario disponible antes de confirmar.' }); return; }
    if (submitting) return;
    try {
      setSubmitting(true);
      setFeedback({ type: 'idle', message: 'Confirmando tu turno...' });
      await reservarTurno({ idCliente: currentUser.idCliente, idProfesional: selectedBarber, idServicio: selectedService, fecha: selectedDate, horaInicio: selectedTime, telefono: customerPhone.trim() }, token);
      setFeedback({ type: 'success', message: `Turno confirmado para ${customerName.trim()} con ${currentBarber.name} (${currentService.name}, $${currentService.price.toLocaleString('es-AR')}) el ${selectedDateLabel.label} ${selectedDateLabel.date} a las ${selectedTime}.` });
      setCustomerName(currentUser?.name ?? ''); setCustomerPhone(currentUser?.phone ?? ''); setSelectedTime('');
      cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos();
    } catch (error) { setFeedback({ type: 'error', message: error.message || 'Error al reservar el turno.' }); }
    finally { setSubmitting(false); }
  };

  // ── Datos derivados para vista del cliente ─────────
  const occupancyCount = daySlots.length - availableSlots.length; const currentUserEmail = currentUser?.email ?? '';
  const currentUserBookings = confirmedBookings.filter((b) => b.ownerEmail === currentUserEmail);
  const pendingBookings = currentUserBookings.filter((b) => b.status === 'pending');
  const expiredBookings = currentUserBookings.filter((b) => b.status === 'expired'); const nextBookings = pendingBookings.slice(0, 3);

  // ── Cancelar y reprogramar turno (cliente) ─────────
  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('¿Seguro que querés cancelar este turno?')) return;
    try { await cancelarTurno(bookingId, token); setFeedback({ type: 'success', message: 'Turno cancelado correctamente.' }); cargarDisponibilidad(); refrescarOcupados(); if (currentUser?.role === 'admin') await cargarTurnosAdmin(); else await cargarMisTurnos(); }
    catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al cancelar el turno.' }); }
  };

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
  const diviProfesionalNombre = (nombreCompleto) => {
    const partes = String(nombreCompleto).trim().split(/\s+/);
    return { nombre: partes[0] ?? '', apellido: partes.slice(1).join(' ') };
  };
  const handleAddBarber = async (nombreCompleto, email, telefono) => {
    const { nombre, apellido } = diviProfesionalNombre(nombreCompleto);
    try {
      await crearProfesional({ nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al agregar el profesional.' }; }
  };
  const handleUpdateBarber = async (id, nombreCompleto, email, telefono) => {
    const { nombre, apellido } = diviProfesionalNombre(nombreCompleto);
    try {
      await actualizarProfesional(id, { nombre, apellido, email: email?.trim() || null, telefono: telefono?.trim() || null }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al actualizar el profesional.' }; }
  };
  const handleDeleteBarber = async (id) => {
    if (!window.confirm('¿Eliminar a este profesional? Sus turnos se mantienen, pero ya no recibirá reservas nuevas.')) return { ok: false };
    try {
      await eliminarProfesional(id, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return { ok: true };
    } catch (error) { if (error.status === 401) expulsarPorSesion(); return { ok: false, error: error.message || 'Error al eliminar el profesional.' }; }
  };
  const handleToggleBarberActivo = async (id, activo) => {
    try {
      await actualizarProfesional(id, { activo: !activo }, token);
      await cargarProfesionales();
      await cargarTodosProfesionales();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al cambiar el estado del profesional.' }); return false; }
  };

  // ── CRUD servicios (agregar, actualizar, eliminar) ──
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
  const handleDeleteService = async (id) => {
    if (!window.confirm('¿Eliminar este servicio del catálogo?')) return false;
    try {
      await eliminarServicio(id, token);
      await cargarServicios();
      return true;
    } catch (error) { if (error.status === 401) expulsarPorSesion(); else setFeedback({ type: 'error', message: error.message || 'Error al eliminar el servicio.' }); return false; }
  };

  // ── Guardar bloqueos y horarios laborales ──────────
  const handleSaveDateBlockouts = useCallback(async (barberId, fecha, body) => {
    try {
      await guardarBloqueos(barberId, { fecha, ...body }, token);
      const b = await obtenerBloqueos();
      if (Array.isArray(b)) setDateBlockouts(b);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);
  const handleSaveHorarios = useCallback(async (barberId, horarios) => {
    try {
      await guardarHorarios(barberId, horarios, token);
      const h = await obtenerHorarios();
      if (Array.isArray(h)) setHorarioLaboral(h);
      return true;
    } catch (error) {
      if (error?.status === 401) expulsarPorSesion();
      return false;
    }
  }, [token, expulsarPorSesion]);
  // ── CRUD turnos admin (actualizar, eliminar) ───────
  const handleUpdateBooking = async (bookingId, updates) => {
    try {
      setFeedback({ type: 'idle', message: 'Guardando el turno...' });
      await actualizarTurno(bookingId, {
        idProfesional: updates.barberId ? Number(updates.barberId) : undefined,
        idServicio: updates.serviceId ? Number(updates.serviceId) : undefined,
        fecha: updates.bookingDate || undefined,
        horaInicio: updates.time || undefined,
        estado: ['pending', 'confirmed', 'completed', 'no-show', 'cancelled'].includes(updates.status) ? updates.status : undefined,
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
  const handleShowMyBookings = () => { setMainView('my-bookings'); try { history.pushState({ view: 'my-bookings' }, '', '#mis-turnos'); } catch {} };
  const handleBackToClient = () => { setMainView('client'); try { history.pushState({ view: 'client' }, '', window.location.pathname); } catch {} };

  useEffect(() => {
    const onPop = () => {
      const isMyBookings = window.location.hash === '#mis-turnos';
      setMainView(isMyBookings ? 'my-bookings' : 'client');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // ── Render de pantallas ────────────────────────────
  if (!isAuthenticated) return (
    <>
      <IniciarSesion authScreen={authScreen} authFeedback={authFeedback} handleGoogleLogin={handleGoogleLogin} handleLoginSubmit={handleLoginSubmit} handleRegisterSubmit={handleRegisterSubmit} loginEmail={loginEmail} loginPassword={loginPassword} onShowLogin={() => setAuthScreen('login')} onShowRegister={() => setAuthScreen('register')} registerForm={registerForm} setLoginEmail={setLoginEmail} setLoginPassword={setLoginPassword} setRegisterForm={setRegisterForm} />
      <WhatsApp />
    </>
  );
  if (currentUser?.role !== 'admin' && (barbers.length === 0 || services.length === 0)) return (
    <main className="simple-page" style={{ display: 'grid', placeItems: 'center', minHeight: '100svh' }}>
      <p style={{ color: 'var(--text-mid)' }}>Cargando datos...</p>
    </main>
  );
  return (
    <>
      {currentUser?.role === 'admin' ? (
        <Admin allBarbers={allBarbers} barbers={barbers} bookings={confirmedBookings} currentUser={currentUser} dateBlockouts={dateBlockouts} horarioLaboral={horarioLaboral} onAddBarber={handleAddBarber} onAddService={handleAddService} onDeleteBarber={handleDeleteBarber} onDeleteBooking={handleDeleteBooking} onDeleteService={handleDeleteService} onLogout={handleLogout} onSaveDateBlockouts={handleSaveDateBlockouts} onSaveHorarios={handleSaveHorarios} onToggleBarberActivo={handleToggleBarberActivo} onUpdateBarber={handleUpdateBarber} onUpdateBooking={handleUpdateBooking} onUpdateService={handleUpdateService} services={services} timeSlots={timeSlots} />
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
