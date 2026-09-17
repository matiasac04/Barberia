// ── Panel de administración (orquestador de paneles) ─
import { useEffect, useMemo, useState } from 'react';
import { toIsoDate } from '../../utilidades/ayudantes';
import Agenda from './Agenda';
import Turnos from './Turnos';
import PieDePagina from '../comunes/PieDePagina';
import Cabecera from '../comunes/Cabecera';
import Resumen from './Resumen';
import Profesionales from './Profesionales';
import Horarios from './Horarios';
import Servicios from './Servicios';

// ── Constantes de formularios y opciones ──────────────
const bookingStatusLabels = { pending: 'Pendiente', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'No se presentó', cancelled: 'Cancelado', expired: 'Expirado' };
const bookingStatusOptions = [
  { value: 'pending', label: 'Pendiente' }, { value: 'confirmed', label: 'Confirmado' },
  { value: 'completed', label: 'Completado' }, { value: 'no-show', label: 'No se presentó' }, { value: 'cancelled', label: 'Cancelado' },
];
const tabOptions = [
  { id: 'overview', label: 'Resumen' }, { id: 'professionals', label: 'Profesionales' }, { id: 'services', label: 'Servicios' },
  { id: 'schedule', label: 'Horarios' }, { id: 'bookings', label: 'Turnos' }, { id: 'agenda', label: 'Agenda' },
];
const emptyBarberForm = { id: '', name: '', email: '', telefono: '' };
const emptyServiceForm = { id: '', name: '', price: '', duracion: '' };
const createBookingForm = (b) => ({
  customerName: b?.customerName ?? '', customerPhone: b?.customerPhone ?? '', barberId: b?.barberId ?? '',
  serviceId: b?.serviceId ?? '', bookingDate: b?.bookingDate ?? '', time: b?.time ?? '', status: b?.status ?? 'pending',
});

function Admin({ allBarbers, barbers, bookings, currentUser, dateBlockouts, horarioLaboral, onAddBarber, onAddService, onDeleteBarber, onDeleteBooking, onDeleteService, onLogout, onSaveDateBlockouts, onSaveHorarios, onToggleBarberActivo, onUpdateBarber, onUpdateBooking, onUpdateService, services, timeSlots }) {
  // ── Estado de formularios y selección ─────────────
  const [activeTab, setActiveTab] = useState('overview');
  const [barberForm, setBarberForm] = useState(emptyBarberForm);
  const [serviceForm, setServiceForm] = useState(emptyServiceForm);
  const [selectedScheduleBarber, setSelectedScheduleBarber] = useState(barbers[0]?.id ?? '');
  const [selectedScheduleDate, setSelectedScheduleDate] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return toIsoDate(d); });
  const [selectedBookingId, setSelectedBookingId] = useState(bookings[0]?.id ?? '');
  const [bookingForm, setBookingForm] = useState(createBookingForm(bookings[0]));
  const [notice, setNotice] = useState({ type: 'idle', message: 'Administrá profesionales, servicios, horarios y turnos desde aquí.' });
  useEffect(() => { if (barbers.length === 0) { setSelectedScheduleBarber(''); return; } if (!barbers.some((b) => String(b.id) === String(selectedScheduleBarber))) setSelectedScheduleBarber(barbers[0].id); }, [barbers, selectedScheduleBarber]);
  useEffect(() => { if (bookings.length === 0) { setSelectedBookingId(''); setBookingForm(createBookingForm()); return; } const sel = bookings.find((b) => b.id === selectedBookingId) ?? bookings[0]; setSelectedBookingId(sel.id); setBookingForm(createBookingForm(sel)); }, [bookings, selectedBookingId]);
  // ── Datos derivados (agenda y estados) ────────────
  const agendaGroups = useMemo(() => {
    const g = new Map();
    bookings.filter((b) => b.status !== 'cancelled').slice().sort((l, r) => `${l.bookingDate}T${l.time}`.localeCompare(`${r.bookingDate}T${r.time}`)).forEach((b) => { const e = g.get(b.bookingDate) ?? []; e.push(b); g.set(b.bookingDate, e); });
    return [...g.entries()];
  }, [bookings]);
  const statusCount = useMemo(() => bookings.reduce((a, b) => { a[b.status] = (a[b.status] ?? 0) + 1; return a; }, { pending: 0, confirmed: 0, completed: 0, 'no-show': 0, cancelled: 0 }), [bookings]);
  // ── Handlers de formularios ───────────────────────
  const handleBarberSubmit = async (e) => {
    e.preventDefault();
    if (!barberForm.name.trim()) { setNotice({ type: 'error', message: 'Escribí un nombre para guardar el profesional.' }); return; }
    let res;
    if (barberForm.id) { res = await onUpdateBarber(barberForm.id, barberForm.name.trim(), barberForm.email, barberForm.telefono); setNotice(res.ok ? { type: 'success', message: 'Profesional actualizado.' } : { type: 'error', message: res.error || 'No se pudo actualizar el profesional.' }); }
    else { res = await onAddBarber(barberForm.name.trim(), barberForm.email, barberForm.telefono); setNotice(res.ok ? { type: 'success', message: 'Profesional agregado.' } : { type: 'error', message: res.error || 'No se pudo agregar el profesional.' }); }
    if (res.ok) setBarberForm(emptyBarberForm);
  };
  const handleDeleteBarberClick = async (id) => { const res = await onDeleteBarber(id); if (res.ok) setBarberForm(emptyBarberForm); else if (res.error) setNotice({ type: 'error', message: res.error }); };
  const handleServiceSubmit = async (e) => {
    e.preventDefault();
    const pv = Number(serviceForm.price);
    const dv = Number(serviceForm.duracion);
    if (!serviceForm.name.trim() || Number.isNaN(pv) || pv <= 0) { setNotice({ type: 'error', message: 'Completá nombre y precio válido para guardar el servicio.' }); return; }
    if (Number.isNaN(dv) || dv <= 0) { setNotice({ type: 'error', message: 'Completá una duración válida (en minutos) para guardar el servicio.' }); return; }
    let ok;
    if (serviceForm.id) { ok = await onUpdateService(serviceForm.id, serviceForm.name.trim(), pv, dv); if (ok) setNotice({ type: 'success', message: 'Servicio actualizado.' }); }
    else { ok = await onAddService(serviceForm.name.trim(), pv, dv); if (ok) setNotice({ type: 'success', message: 'Servicio agregado.' }); }
    if (ok) setServiceForm(emptyServiceForm);
  };
  const handleDeleteServiceClick = async (s) => { if (await onDeleteService(s.id)) setServiceForm(emptyServiceForm); };
  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    if (!selectedBookingId) { setNotice({ type: 'error', message: 'No hay un turno seleccionado para editar.' }); return; }
    if (!bookingForm.customerName.trim() || !bookingForm.customerPhone.trim()) { setNotice({ type: 'error', message: 'Completá nombre y celular del turno.' }); return; }
    const ok = await onUpdateBooking(selectedBookingId, bookingForm);
    setNotice(ok ? { type: 'success', message: 'Turno actualizado en la base de datos.' } : { type: 'error', message: 'No se pudo actualizar el turno. Revisá la conexión y que la sesión siga activa.' });
  };
  // ── Render del panel ──────────────────────────────
  const selectedBooking = bookings.find((b) => b.id === selectedBookingId) ?? bookings[0] ?? null;
  const startEditBarber = (b) => setBarberForm({ id: b.id, name: b.name, email: b.email ?? '', telefono: b.telefono ?? '' });
  const startEditService = (s) => setServiceForm({ id: s.id, name: s.name, price: String(s.price), duracion: s.durationMinutes != null ? String(s.durationMinutes) : '' });
  const startEditBooking = (b) => { setSelectedBookingId(b.id); setBookingForm(createBookingForm(b)); };
  return (
    <main className="simple-page admin-page">
      <Cabecera subtitle="Panel administrativo" />
      <section className="simple-card client-topbar admin-topbar">
        <div><h2>Panel de administración</h2><p>Controlá la operación de la barbería.{currentUser ? ` Sesión activa: ${currentUser.email}.` : ''}</p></div>
        <button type="button" className="client-logout" onClick={onLogout}>Cerrar sesión</button>
      </section>
      <section className="simple-card admin-summary">
        <div><strong>{barbers.length}</strong><span>Profesionales</span></div>
        <div><strong>{services.length}</strong><span>Servicios</span></div>
        <div><strong>{statusCount.pending + statusCount.confirmed}</strong><span>Turnos activos</span></div>
        <div><strong>{statusCount.completed + statusCount['no-show']}</strong><span>Histórico</span></div>
      </section>
      <section className="simple-card admin-tabs">
        {tabOptions.map((t) => <button key={t.id} type="button" aria-pressed={activeTab === t.id} className={`admin-tab ${activeTab === t.id ? 'selected' : ''}`} onClick={() => setActiveTab(t.id)}>{t.label}</button>)}
      </section>
      <section className="admin-content">
        {activeTab === 'overview' && <Resumen bookingStatusOptions={bookingStatusOptions} statusCount={statusCount} />}
        {activeTab === 'professionals' && <Profesionales allBarbers={allBarbers} barberForm={barberForm} barbers={barbers} emptyBarberForm={emptyBarberForm} onBarberFormChange={setBarberForm} onBarberSubmit={handleBarberSubmit} onCancelBarberEdit={() => setBarberForm(emptyBarberForm)} onDeleteBarber={handleDeleteBarberClick} onStartEditBarber={startEditBarber} onToggleBarberActivo={onToggleBarberActivo} />}
        {activeTab === 'services' && <Servicios emptyServiceForm={emptyServiceForm} onCancelServiceEdit={() => setServiceForm(emptyServiceForm)} onDeleteService={handleDeleteServiceClick} onServiceFormChange={setServiceForm} onServiceSubmit={handleServiceSubmit} onStartEditService={startEditService} serviceForm={serviceForm} services={services} />}
        {activeTab === 'schedule' && <Horarios barbers={barbers} dateBlockouts={dateBlockouts} horarioLaboral={horarioLaboral} onSaveDateBlockouts={onSaveDateBlockouts} onSaveHorarios={onSaveHorarios} selectedScheduleBarber={selectedScheduleBarber} selectedScheduleDate={selectedScheduleDate} setSelectedScheduleBarber={setSelectedScheduleBarber} setSelectedScheduleDate={setSelectedScheduleDate} timeSlots={timeSlots} />}
        {activeTab === 'bookings' && <Turnos barbers={barbers} bookingForm={bookingForm} bookingStatusOptions={bookingStatusOptions} bookings={bookings} onBookingFormChange={setBookingForm} onBookingSubmit={handleBookingSubmit} onDeleteBooking={onDeleteBooking} onStartEditBooking={startEditBooking} services={services} selectedBooking={selectedBooking} />}
        {activeTab === 'agenda' && <Agenda agendaGroups={agendaGroups} barbers={barbers} bookingStatusLabels={bookingStatusLabels} />}
      </section>
      <div className={`simple-feedback ${notice.type} admin-feedback`}>{notice.message}</div>
      <PieDePagina />
    </main>
  );
}
export default Admin;
