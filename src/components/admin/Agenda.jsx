// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   pesoEstado()            → L26
//   Agenda()                → L28
//   profesionalesPorId      → L35
//   gruposAgenda (useMemo)  → L37
//   return / render         → L60
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

// pesoEstado define prioridad para ordenar: Confirmado primero (pendiente), otros intermedios, Expirado al final
const pesoEstado = (estado) => (estado === 'Confirmado' ? 0 : estado === 'Expirado' ? 2 : 1);

function Agenda({ turnos, profesionales, etiquetasEstado, clasesEstado }) {
  // Filtros compartidos con Turnos; en Agenda se ocultan cancelados vía incluirCancelado={false}
  const [filtroProfesional, setFiltroProfesional] = useState('todos');
  const [filtroEstado, setFiltroEstado] = useState('todos');
  // Por defecto muestra la agenda del día actual
  const [filtroFecha, setFiltroFecha] = useState(() => fechaAIso(new Date()));
  // Mapa para resolver nombre del profesional sin hacer find por cada turno
  const profesionalesPorId = useMemo(() => new Map(profesionales.map((b) => [String(b.id), b])), [profesionales]);
  // Agrupa por fecha, filtra cancelados y ordena: días con turnos pendientes primero, expirados al final; dentro del día pendientes primero
  const gruposAgenda = useMemo(() => {
    // Aplica filtros igual que Turnos pero excluye explícitamente 'Cancelado' (regla de negocio de esta vista)
    const filtrados = (Array.isArray(turnos) ? turnos : []).filter((b) =>
      b.estado !== 'Cancelado' &&
      (filtroProfesional === 'todos' || String(b.idProfesional) === String(filtroProfesional)) &&
      (filtroEstado === 'todos' || b.estado === filtroEstado) &&
      (!filtroFecha || b.fecha === filtroFecha)
    );
    // Agrupa por fecha
    const grupos = new Map();
    filtrados.forEach((b) => { const e = grupos.get(b.fecha) ?? []; e.push(b); grupos.set(b.fecha, e); });
    const lista = [...grupos.entries()];
    // Dentro de cada día: primero por peso de estado, luego por hora para mantener orden cronológico
    lista.forEach(([, turnosDia]) => turnosDia.sort((l, r) => pesoEstado(l.estado) - pesoEstado(r.estado) || String(l.hora).localeCompare(String(r.hora))));
    // Orden de días: prioriza días con al menos un turno pendiente (peso 0); si hay pendientes, ascendente por fecha; si son todos expirados, descendente
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
      {/* Filtros compartidos; incluirCancelado false oculta 'Cancelado' para esta vista */}
      <FiltrosTurnos profesionales={profesionales} etiquetasEstado={etiquetasEstado} incluirCancelado={false} filtroProfesional={filtroProfesional} setFiltroProfesional={setFiltroProfesional} filtroEstado={filtroEstado} setFiltroEstado={setFiltroEstado} filtroFecha={filtroFecha} setFiltroFecha={setFiltroFecha} />
      <div className="admin-agenda-list">
        {/* Renderiza grupos por fecha ya ordenados por lógica de prioridad */}
        {gruposAgenda.map(([fecha, turnosDia]) => (
          <section key={fecha} className="admin-agenda-day">
            <h3>{fecha}</h3>
            <div className="admin-list">
              {turnosDia.map((b) => {
                // Busca nombre del profesional en el mapa para mostrarlo aunque falte nombre en el turno
                const p = profesionalesPorId.get(String(b.idProfesional));
                return (
                  <div key={b.id} className="admin-row admin-booking-row">
                    <div>
                      <strong>{p?.name ?? `Profesional #${b.idProfesional}`}</strong>
                      {/* Datos del turno: cliente, servicio y hora */}
                      <span>{b.nombreCliente} · {b.nombreServicio} · {b.hora}</span>
                      {/* Estado con etiqueta y clase desde props para mantener coherencia visual */}
                      <span className={`booking-status ${clasesEstado[b.estado] ?? 'status-cancelled'}`}>{etiquetasEstado[b.estado] ?? b.estado}</span>
                    </div>
                    <div className="admin-row-actions">
                      {/* Precio del servicio formateado en ARS */}
                      <span className="admin-booking-price">${Number(b.precioServicio ?? 0).toLocaleString('es-AR')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
        {/* Mensaje si no hay resultados tras aplicar filtros */}
        {gruposAgenda.length === 0 ? <p className="admin-empty">No hay turnos para mostrar con esos filtros.</p> : null}
      </div>
    </article>
  );
}
export default Agenda;
