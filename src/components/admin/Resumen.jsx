// ═══════════════════════════════════════════════════════════════════
// RESUMEN OPERATIVO (admin) — tarjetas de conteo por estado
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es la pestaña "Resumen": un tablero de solo lectura con un contador por
// estado de turno. NO calcula nada: App.jsx ya hizo el conteo en `statusCount`
// (un objeto { pending: n, completed: n, 'no-show': n, cancelled: n, expired: n })
// y le pasa las opciones (`bookingStatusOptions`) para iterar en el mismo orden
// que el <select> del panel Turnos.
//
// OJO: 'expired' se cuenta pero no aparece en bookingStatusOptions, así que no
// se muestra una tarjeta para él. Antes existía un estado 'confirmed' que
// resolveBookingStatus nunca devolvía y por eso esa tarjeta valía 0 siempre.
//
// Solo renderiza: una <div className="admin-status-card"> por estado con su
// etiqueta y la cantidad ("N turnos"). El texto largo sirve de guía para
// saber qué se puede administrar desde las otras pestañas.
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
