// ── Panel de turnos admin (editar y eliminar turnos) ──
const bookingStatusLabels = { pending: 'Pendiente', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'No se presentó', cancelled: 'Cancelado', expired: 'Expirado' };
function Turnos({ barbers, bookingForm, bookingStatusOptions, bookings, onBookingFormChange, onBookingSubmit, onDeleteBooking, onStartEditBooking, services, selectedBooking }) {
  return (
    <article className="simple-card admin-panel">
      <h2>Editar turnos</h2>
      <p className="admin-note">Elegí un turno de la lista para cargarlo en el formulario y editarlo.</p>
      {selectedBooking ? (
        <form className="admin-form admin-booking-form" onSubmit={onBookingSubmit}>
          <div className="admin-inline-grid">
            <input type="text" placeholder="Nombre del cliente" value={bookingForm.customerName} onChange={(e) => onBookingFormChange((p) => ({ ...p, customerName: e.target.value }))} />
            <input type="tel" placeholder="Celular" value={bookingForm.customerPhone} onChange={(e) => onBookingFormChange((p) => ({ ...p, customerPhone: e.target.value }))} />
          </div>
          <div className="admin-inline-grid">
            <select value={bookingForm.barberId} onChange={(e) => onBookingFormChange((p) => ({ ...p, barberId: e.target.value }))}>
              {barbers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={bookingForm.serviceId} onChange={(e) => onBookingFormChange((p) => ({ ...p, serviceId: e.target.value }))}>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="admin-inline-grid">
            <input type="date" value={bookingForm.bookingDate} onChange={(e) => onBookingFormChange((p) => ({ ...p, bookingDate: e.target.value }))} />
            <input type="time" value={bookingForm.time} onChange={(e) => onBookingFormChange((p) => ({ ...p, time: e.target.value }))} />
          </div>
          <div className="admin-inline-grid">
            <select value={bookingForm.status} onChange={(e) => onBookingFormChange((p) => ({ ...p, status: e.target.value }))}>
              {bookingStatusOptions.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button className="simple-submit" type="submit">Guardar turno</button>
          </div>
        </form>
      ) : <p className="admin-note">No hay turnos para editar.</p>}
      <div className="admin-list">
        {bookings.map((b) => (
          <div key={b.id} className="admin-row admin-booking-row">
            <div>
              <strong>{b.customerName}</strong>
              <span>{b.barberName} · {b.serviceName} · {b.bookingDate} · {b.time}</span>
              <span className={`booking-status status-${b.status}`}>{bookingStatusLabels[b.status] ?? b.status}</span>
            </div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onStartEditBooking(b)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onDeleteBooking(b.id)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
export default Turnos;
