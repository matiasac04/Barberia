// ── Panel de servicios (alta, edición, eliminación) ───
function Servicios({ onCancelServiceEdit, onDeleteService, onServiceFormChange, onServiceSubmit, onStartEditService, serviceForm, services }) {
  return (
    <article className="simple-card admin-panel">
      <h2>Servicios</h2>
      <p className="admin-note">Mantené el catálogo actualizado; los precios se muestran en pesos (ARS).</p>
      <form className="admin-form admin-service-form" onSubmit={onServiceSubmit}>
        <input type="text" placeholder="Nombre del servicio" value={serviceForm.name} onChange={(e) => onServiceFormChange((p) => ({ ...p, name: e.target.value }))} />
        <div className="admin-inline-grid">
          <input type="number" min="1" placeholder="Precio ($)" value={serviceForm.price} onChange={(e) => onServiceFormChange((p) => ({ ...p, price: e.target.value }))} />
          <input type="number" min="1" placeholder="Duración (min)" value={serviceForm.duracion} onChange={(e) => onServiceFormChange((p) => ({ ...p, duracion: e.target.value }))} />
        </div>
        <div className="admin-actions-row">
          <button className="simple-submit" type="submit">{serviceForm.id ? 'Guardar cambios' : 'Agregar servicio'}</button>
          {serviceForm.id ? <button className="auth-submit secondary" type="button" onClick={onCancelServiceEdit}>Cancelar</button> : null}
        </div>
      </form>
      <div className="admin-list">
        {services.map((s) => (
          <div key={s.id} className="admin-row">
            <div><strong>{s.name}</strong><span>${Number(s.price || 0).toLocaleString('es-AR')} · {s.durationMinutes ?? 0} min</span></div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onStartEditService(s)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onDeleteService(s)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}
export default Servicios;
