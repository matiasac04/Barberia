// ── Configuración y helper de peticiones ─────────────
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

const peticion = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers };
  const res = await fetch(`${API_URL}${path}`, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || "Error en la solicitud al servidor."); err.status = res.status; throw err; }
  return data;
};

// ── Autenticación ─────────────────────────────────────
export const registrarCliente = (datos) => peticion("/registro", { method: "POST", body: datos });
export const loginCliente = (email, password) => peticion("/login", { method: "POST", headers: { Authorization: `Basic ${btoa(`${email}:${password}`)}` } });
export const verificarToken = (token) => peticion("/verificar", { token });

// ── Profesionales ─────────────────────────────────────
export const obtenerProfesionales = (incluirInactivos = false) => peticion(`/profesionales${incluirInactivos ? "?incluirInactivos=1" : ""}`);
export const crearProfesional = (datos, token) => peticion("/profesionales", { method: "POST", token, body: datos });
export const actualizarProfesional = (id, datos, token) => peticion(`/profesionales/${id}`, { method: "PATCH", token, body: datos });
export const eliminarProfesional = (id, token) => peticion(`/profesionales/${id}`, { method: "DELETE", token });

// ── Servicios ─────────────────────────────────────────
export const obtenerServicios = () => peticion("/servicios");
export const crearServicio = (datos, token) => peticion("/servicios", { method: "POST", token, body: datos });
export const actualizarServicio = (id, datos, token) => peticion(`/servicios/${id}`, { method: "PATCH", token, body: datos });
export const eliminarServicio = (id, token) => peticion(`/servicios/${id}`, { method: "DELETE", token });

// ── Turnos (cliente y admin) ──────────────────────────
export const obtenerTurnosCliente = (idCliente, token) => peticion(`/clientes/${idCliente}/turnos`, { token });
export const obtenerTurnos = (token) => peticion("/turnos", { token });
export const obtenerTurnosDisponibles = (fecha, idProfesional) => peticion(`/turnos/disponibles?fecha=${fecha}&idProfesional=${idProfesional}`);
export const obtenerTurnosOcupados = (inicio, fin) => peticion(`/turnos/ocupados?inicio=${inicio}&fin=${fin}`);
export const reservarTurno = (datos, token) => peticion("/turnos", { method: "POST", token, body: datos });
export const cancelarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}/cancelar`, { method: "PATCH", token });
export const actualizarTurno = (idTurno, datos, token) => peticion(`/turnos/${idTurno}`, { method: "PATCH", token, body: datos });
export const eliminarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}`, { method: "DELETE", token });

// ── Bloqueos y horarios laborales ─────────────────────
export const obtenerBloqueos = () => peticion("/bloqueos");
export const obtenerHorarios = () => peticion("/horarios");
export const guardarBloqueos = (id, body, token) => peticion(`/profesionales/${id}/bloqueos`, { method: "POST", token, body });
export const guardarHorarios = (id, horarios, token) => peticion(`/profesionales/${id}/horarios`, { method: "PUT", token, body: { horarios } });