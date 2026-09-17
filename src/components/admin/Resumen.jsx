// ── Panel de resumen operativo (estados de turnos) ───
function Resumen({ bookingStatusOptions, statusCount }) {
  return (
    <article className="simple-card admin-panel">
      <h2>Resumen operativo</h2>
      <p className="admin-note">Desde este panel podés dar de alta profesionales y servicios, modificar turnos, cambiar su estado y revisar la agenda.</p>
      <div className="admin-status-grid">
        {bookingStatusOptions.map((s) => (
          <div key={s.value} className="admin-status-card"><strong>{s.label}</strong><span>{statusCount[s.value] ?? 0} turnos</span></div>
        ))}
      </div>
    </article>
  );
}
export default Resumen;
