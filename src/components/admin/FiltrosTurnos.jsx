// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   FiltrosTurnos()         → L16
//   estados (derivado)      → L18
//   fechaHoy (const)        → L20
//   hayFiltros (derivado)   → L22
//   limpiar()               → L24
//   return / render         → L25
// ═══════════════════════════════════════════════════════════════════
// Barra de filtros compartida por los paneles de Turnos y Agenda:
// profesional, estado y fecha. El estado "Cancelado" se puede ocultar con
// incluirCancelado={false} (lo usa Agenda, que no muestra cancelados).
import { fechaAIso } from '../../utilidades/funciones';

function FiltrosTurnos({ profesionales, etiquetasEstado, filtroProfesional, setFiltroProfesional, filtroEstado, setFiltroEstado, filtroFecha, setFiltroFecha, incluirCancelado = true }) {
  // Construye la lista de estados a mostrar: si incluirCancelado es false (Agenda), saca 'Cancelado' para no mostrar turnos cancelados
  const estados = Object.entries(etiquetasEstado).filter(([value]) => incluirCancelado || value !== 'Cancelado');
  // Guarda la fecha de hoy para saber si hay filtros activos distintos al valor por defecto
  const fechaHoy = fechaAIso(new Date());
  // hayFiltros habilita el botón "Limpiar filtros" solo cuando hay algún filtro distinto al inicial
  const hayFiltros = filtroProfesional !== 'todos' || filtroEstado !== 'todos' || filtroFecha !== fechaHoy;
  // limpiar resetea los 3 filtros: vuelve a 'todos' y limpia la fecha (Turnos/Agenda inicializan distinto, pero acá se normaliza)
  const limpiar = () => { setFiltroProfesional('todos'); setFiltroEstado('todos'); setFiltroFecha(''); };
  return (
    <div className="admin-schedule-toolbar">
      {/* Filtro por profesional: filtra por id del turno contra el profesional seleccionado */}
      <div className="admin-select-group">
        <label>Profesional</label>
        <select value={filtroProfesional} onChange={(e) => setFiltroProfesional(e.target.value)}>
          <option value="todos">Todos los profesionales</option>
          {profesionales.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      {/* Filtro por estado: usa etiquetasEstado (definidas en Admin.jsx) para mantener coherencia */}
      <div className="admin-select-group">
        <label>Estado</label>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {estados.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      {/* Filtro por fecha: filtra turnos exactamente por la fecha ISO seleccionada */}
      <div className="admin-select-group">
        <label>Fecha</label>
        <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />
      </div>
      {/* Botón para limpiar: solo habilitado si hay filtros distintos al estado inicial */}
      <div className="admin-select-group">
        <button type="button" className="auth-submit secondary" onClick={limpiar} disabled={!hayFiltros}>Limpiar filtros</button>
      </div>
    </div>
  );
}
export default FiltrosTurnos;
