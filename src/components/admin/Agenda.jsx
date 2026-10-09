// ═══════════════════════════════════════════════════════════════════
// PANEL DE AGENDA (admin) — turnos agrupados por fecha
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Muestra la grilla de turnos para tener la agenda de un vistazo.
// Recibe `turnos` (con estado ya calculado, incluido 'Expirado') desde
// Admin.jsx y acá se agrupa por fecha aplicando los filtros de
// profesional, estado y fecha (componente FiltrosTurnos).
// Los turnos 'Cancelado' NUNCA se muestran. El orden deja primero los
// días con turnos pendientes (fecha ascendente) y al final los expirados;
// dentro de cada día van primero los pendientes y después los expirados.
import { useMemo, useState } from 'react';
import FiltrosTurnos from './FiltrosTurnos';
import { fechaAIso } from '../../utilidades/funciones';

const pesoEstado = (estado) => (estado === 'Confirmado' ? 0 : estado === 'Expirado' ? 2 : 1);

function Agenda({ turnos, profesionales, etiquetasEstado, clasesEstado }) {
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [filtroFecha, setFiltroFecha] = useState(() => fechaAIso(new Date()));
  const profesionalesPorId = useMemo(() => new Map(profesionales.map((b) => [String(b.id), b])), [profesionales]);
  const gruposAgenda = useMemo(() => {
    const filtrados = (Array.isArray(turnos) ? turnos : []).filter((b) =>
      b.estado !== 'Cancelado' &&
      (filtroProfesional === 'todos' || String(b.idProfesional) === String(filtroProfesional)) &&
      (filtroEstado === 'todos' || b.estado === filtroEstado) &&
      (!filtroFecha || b.fecha === filtroFecha)
    );
    const grupos = new Map();
    filtrados.forEach((b) => { const e = grupos.get(b.fecha) ?? []; e.push(b); grupos.set(b.fecha, e); });
    const lista = [...grupos.entries()];
    lista.forEach(([, turnosDia]) => turnosDia.sort((l, r) => pesoEstado(l.estado) - pesoEstado(r.estado) || String(l.hora).localeCompare(String(r.hora))));
    lista.sort(([fechaA, turnosA], [fechaB, turnosB]) => {
      const pesoA = Math.min(...turnosA.map((t) => pesoEstado(t.estado)));
      const pesoB = Math.min(...turnosB.map((t) => pesoEstado(t.estado)));
      if (pesoA !== pesoB) return pesoA - pesoB;
      return pesoA === 0 ? fechaA.localeCompare(fechaB) : fechaB.localeCompare(fechaA);
    });
    return lista;
  }, [turnos, filtroProfesional, filtroEstado, filtroFecha]);
  return (
    <article className="simple-card admin-panel">
      <h2>Agenda</h2>
      <p className="admin-note">Filtrá por profesional, estado o fecha. Primero los turnos pendientes y al final los expirados.</p>
      <FiltrosTurnos profesionales={profesionales} etiquetasEstado={etiquetasEstado} incluirCancelado={false} filtroProfesional={filtroProfesional} setFiltroProfesional={setFiltroProfesional} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} filtroFecha={filtroFecha} setFiltroFecha={setFiltroFecha} />
      <div className="admin-agenda-list">
        {gruposAgenda.map(([fecha, turnosDia]) => (
          <section key={fecha} className="admin-agenda-day">
            <h3>{fecha}</h3>
            <div className="admin-list">
              {turnosDia.map((b) => {
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
        {gruposAgenda.length === 0 ? <p className="admin-empty">No hay turnos para mostrar con esos filtros.</p> : null}
      </div>
    </article>
  );
}
export default Agenda;
