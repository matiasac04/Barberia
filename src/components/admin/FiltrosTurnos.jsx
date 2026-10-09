// Barra de filtros compartida por los paneles de Turnos y Agenda:
// profesional, estado y fecha. El estado "Cancelado" se puede ocultar con
// incluirCancelado={false} (lo usa Agenda, que no muestra cancelados).
import { fechaAIso } from '../../utilidades/funciones';

function FiltrosTurnos({ profesionales, etiquetasEstado, filtroProfesional, setFiltroProfesional, filtroEstado, setFiltroEstado, filtroFecha, setFiltroFecha, incluirCancelado = true }) {
  const estados = Object.entries(etiquetasEstado).filter(([value]) => incluirCancelado || value !== 'Cancelado');
  const fechaHoy = fechaAIso(new Date());
  const hayFiltros = filtroProfesional !== 'todos' || filtroEstado !== 'todos' || filtroFecha !== fechaHoy;
  const limpiar = () => { setFiltroProfesional('todos'); setFiltroEstado('todos'); setFiltroFecha(''); };
  return (
    <div className="admin-schedule-toolbar">
      <div className="admin-select-group">
        <label>Profesional</label>
        <select value={filtroProfesional} onChange={(e) => setFiltroProfesional(e.target.value)}>
          <option value="todos">Todos los profesionales</option>
          {profesionales.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div className="admin-select-group">
        <label>Estado</label>
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="todos">Todos los estados</option>
          {estados.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
      <div className="admin-select-group">
        <label>Fecha</label>
        <input type="date" value={filtroFecha} onChange={(e) => setFiltroFecha(e.target.value)} />
      </div>
      <div className="admin-select-group">
        <button type="button" className="auth-submit secondary" onClick={limpiar} disabled={!hayFiltros}>Limpiar filtros</button>
      </div>
    </div>
  );
}
export default FiltrosTurnos;
