// ═══════════════════════════════════════════════════════════════════
// PANEL DE AGENDA (admin) — turnos del día agrupados por fecha
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Muestra la grilla de turnos para tener la agenda de un vistazo.
// Admin.jsx ya le entrega `gruposAgenda` (turnos por fecha, ordenados
// de menor a mayor por fecha+hora). Acá se tienen en cuenta los
// cancelados: en App.jsx relanzar al hijo no se hace, en cambio
// Admin.jsx filtra el estado 'Cancelado' a la hora de agrupar, así que
// en esta pantalla NUNCA aparece un turno cancelado.
import { useMemo } from 'react';

function Agenda({ gruposAgenda, profesionales, etiquetasEstado, clasesEstado }) {
  const profesionalesPorId = useMemo(() => new Map(profesionales.map((b) => [String(b.id), b])), [profesionales]);
  return (
    <article className="simple-card admin-panel">
      <h2>Agenda</h2>
      <div className="admin-agenda">
        {gruposAgenda.map(([fecha, turnos]) => (
          <section key={fecha} className="admin-agenda-day">
            <h3>{fecha}</h3>
            <div className="admin-list">
              {turnos.map((b) => {
                const p = profesionalesPorId.get(String(b.idProfesional));
                return (
                  <div key={b.id} className="admin-row admin-booking-row">
                    <div>
                      <strong>{p?.name ?? `Profesional #${b.idProfesional}`}</strong>
                      <span>{b.nombreCliente} · {b.nombreServicio} · {b.hora}</span>
                      <span className={`booking-status ${clasesEstado[b.estado] ?? 'status-cancelled'}`}>{etiquetasEstado[b.estado] ?? b.estado}</span>
                    </div>
                    <div className="admin-row-actions">
                      <span className="admin-booking-price">${Number(b.precioServicio ?? 0).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {gruposAgenda.length === 0 ? <p className="admin-empty">No hay turnos para mostrar.</p> : null}
      </div>
    </article>
  );
}
export default Agenda;