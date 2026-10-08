// ═══════════════════════════════════════════════════════════════════
// RESUMEN OPERATIVO (admin) — tarjetas de conteo por estado
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es la pestaña "Resumen": un tablero de solo lectura con un contador por
// estado de turno. NO calcula nada: App.jsx ya hizo el conteo en `conteoEstados`
// (un objeto { Confirmado: n, Completado: n, NoSePresento: n, Cancelado: n,
// Expirado: n }) y le pasa las opciones (`opcionesEstado`) para iterar en el
// mismo orden que el <select> del panel Turnos.
//
// OJO: 'Expirado' se cuenta pero no aparece en opcionesEstado, así que no
// se muestra una tarjeta para él (es un estado derivado en el frontend).
//
// Solo renderiza: una <div className="admin-status-card"> por estado con su
// etiqueta y la cantidad ("N turnos"). El texto largo sirve de guía para
// saber qué se puede administrar desde las otras pestañas.
function Resumen({ opcionesEstado, conteoEstados }) {
  return (
    <article className="simple-card admin-panel">
      <h2>Resumen operativo</h2>
      <p className="admin-note">Desde este panel podés dar de alta profesionales y servicios, modificar turnos, cambiar su estado y revisar la agenda.</p>
      <div className="admin-status-grid">
        {opcionesEstado.map((s) => (
          <div key={s.value} className="admin-status-card"><strong>{s.label}</strong><span>{conteoEstados[s.value] ?? 0} turnos</span></div>
        ))}
      </div>
    </article>
  );
}
export default Resumen;