// ── Agenda cronológica de turnos (filtrable) ─────────
import { useMemo, useState } from 'react';
function Agenda({ agendaGroups, barbers, bookingStatusLabels }) {
  // ── Filtro por profesional ────────────────────────
  const [filterBarber, setFilterBarber] = useState('all');
  const filteredGroups = useMemo(() => {
    if (filterBarber === 'all') return agendaGroups;
    return agendaGroups
      .map(([date, dayBookings]) => [date, dayBookings.filter((b) => String(b.barberId) === filterBarber)])
      .filter(([, dayBookings]) => dayBookings.length > 0);
  }, [agendaGroups, filterBarber]);
  const total = filteredGroups.reduce((n, [, db]) => n + db.length, 0);
  return (
    <article className="simple-card admin-panel">
      <h2>Agenda</h2>
      <p className="admin-note">Vista cronológica de los turnos que todavía están activos en la operación. Podés filtrar por profesional.</p>
      <div className="admin-agenda-filter">
        <label htmlFor="agenda-barber">Peluquero</label>
        <select id="agenda-barber" value={filterBarber} onChange={(e) => setFilterBarber(e.target.value)}>
          <option value="all">Todos</option>
          {barbers.map((b) => <option key={b.id} value={String(b.id)}>{b.name}</option>)}
        </select>
        <span className="admin-agenda-count">{total} turnos</span>
      </div>
      <div className="admin-agenda-list">
        {filteredGroups.length > 0 ? filteredGroups.map(([date, dayBookings]) => (
          <section key={date} className="admin-agenda-day">
            <div className="simple-section-head"><h3>{date}</h3><span>{dayBookings.length} turnos</span></div>
            <div className="admin-list">
              {dayBookings.map((b) => (
                <div key={b.id} className="admin-row">
                  <div>
                    <strong>{b.time} · {b.customerName}</strong>
                    <span>{b.barberName} · {b.serviceName}</span>
                    <span className="admin-phone">{b.customerPhone ? `Tel: ${b.customerPhone}` : 'Tel: no cargado'}</span>
                  </div>
                  <span className={`booking-status status-${b.status}`}>{bookingStatusLabels[b.status] ?? b.status}</span>
                </div>
              ))}
            </div>
          </section>
        )) : <p className="admin-note">No hay turnos para mostrar en la agenda.</p>}
      </div>
    </article>
  );
}
export default Agenda;
