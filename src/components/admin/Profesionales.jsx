// ── Panel de profesionales (altas, bajas, edición) ────
function Profesionales({ allBarbers, barbers, barberForm, onBarberFormChange, onBarberSubmit, onDeleteBarber, onStartEditBarber, onCancelBarberEdit, onToggleBarberActivo }) {
  // ── Separar activos de desactivados ────────────────
  const fuente = Array.isArray(allBarbers) && allBarbers.length > 0 ? allBarbers : barbers;
  const activos = fuente.filter((b) => b.activo !== false);
  const desactivados = fuente.filter((b) => b.activo === false);
  return (
    <article className="simple-card admin-panel">
      <h2>Profesionales</h2>
      <p className="admin-note">Agregá, editá o eliminá a los profesionales que atienden la barbería. Si eliminás uno, deja de recibir reservas nuevas.</p>
      <form className="admin-form" onSubmit={onBarberSubmit}>
        <input type="text" placeholder="Nombre del profesional" value={barberForm.name} onChange={(e) => onBarberFormChange((p) => ({ ...p, name: e.target.value }))} />
        <input type="email" placeholder="Email" value={barberForm.email} onChange={(e) => onBarberFormChange((p) => ({ ...p, email: e.target.value }))} />
        <input type="tel" placeholder="Teléfono" value={barberForm.telefono} onChange={(e) => onBarberFormChange((p) => ({ ...p, telefono: e.target.value }))} />
        <div className="admin-actions-row">
          <button className="simple-submit" type="submit">{barberForm.id ? 'Guardar cambios' : 'Agregar profesional'}</button>
          {barberForm.id ? <button className="auth-submit secondary" type="button" onClick={onCancelBarberEdit}>Cancelar</button> : null}
        </div>
      </form>
      <div className="admin-list">
        {activos.map((b) => (
          <div key={b.id} className="admin-row">
            <div>
              <strong>{b.name}</strong>
              <span>ID: {b.id}</span>
              {b.email ? <span> · {b.email}</span> : null}
              {b.telefono ? <span> · {b.telefono}</span> : null}
            </div>
            <div className="admin-row-actions">
              <button type="button" className="auth-submit tertiary" onClick={() => onStartEditBarber(b)}>Editar</button>
              <button type="button" className="booking-cancel" onClick={() => onDeleteBarber(b.id)}>Eliminar</button>
            </div>
          </div>
        ))}
        {activos.length === 0 ? <p className="admin-empty">No hay profesionales activos. Agregá uno arriba.</p> : null}
      </div>
      {desactivados.length > 0 ? (
        <details className="admin-inactive-block">
          <summary>Profesionales desactivados ({desactivados.length})</summary>
          <div className="admin-list">
            {desactivados.map((b) => (
              <div key={b.id} className="admin-row admin-row-inactivo">
                <div>
                  <strong>{b.name}</strong>
                  <span>ID: {b.id} · Inactivo</span>
                  {b.email ? <span> · {b.email}</span> : null}
                  {b.telefono ? <span> · {b.telefono}</span> : null}
                </div>
                <div className="admin-row-actions">
                  <button type="button" className="auth-submit tertiary" onClick={() => onToggleBarberActivo(b.id, false)}>Reactivar</button>
                  <button type="button" className="auth-submit tertiary" onClick={() => onStartEditBarber(b)}>Editar</button>
                </div>
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
export default Profesionales;
