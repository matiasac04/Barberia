// ═══════════════════════════════════════════════════════════════════
// CAPA DE COMUNICACIÓN CON EL BACKEND (API REST)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA ESTE MÓDULO?
//
// Actúa como "capa de servicios" (service layer): centraliza TODAS las
// llamadas HTTP al backend Express. En lugar de hacer fetch disperso por
// componentes, App.jsx llama a estas funciones exportadas.
//
// FLUJO DE UNA PETICIÓN:
// 1. Componente/App.jsx llama a una función (ej. obtenerProfesionales())
// 2. Esa función construye path/opciones y llama a peticion()
// 3. peticion() arma URL completa (API_URL + path), headers y body
// 4. Hace fetch() al backend (http://localhost:3000 por defecto)
// 5. Parsea respuesta JSON. Si !res.ok → lanza Error con .status + mensaje
// 6. Devuelve data (JSON) al llamador
// 7. App.jsx actualiza estado con la respuesta
//
// ¿POR QUÉ ASÍ?
// - Un solo punto para cambiar base URL (VITE_API_URL en prod)
// - Manejo uniforme de errores (status + mensaje del server)
// - Headers de auth automáticos (Bearer token) cuando se pasa token
// - Serialización JSON consistente
//
// ── Configuración y helper de peticiones ─────────────
// API_URL: base del backend. En desarrollo localhost:3000.
// En producción (Vercel + Belmo) se define VITE_API_URL en variables de entorno.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// peticion(): helper genérico para todas las requests.
// Parámetros (opciones):
//   - method: HTTP (GET por defecto)
//   - token:  si existe → agrega Authorization: Bearer <token> (JWT)
//   - body:   si existe → JSON.stringify + Content-Type: application/json
//   - headers: extras que se mezclan
// Comportamiento:
//   - Lee respuesta, intenta parsear JSON (catch → {} si no es JSON)
//   - Si res.ok → devuelve data. Si no → crea Error con data.error o genérico
//     y le agrega .status = res.status (útil para 401/403/409)
//   - Lanza excepción al llamador (quien decide cómo mostrar feedback)
const peticion = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers };
  const res = await fetch(`${API_URL}${path}`, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || "Error en la solicitud al servidor."); err.status = res.status; throw err; }
  return data;
};

// ── Autenticación ─────────────────────────────────────
// registrarCliente: alta de cuenta nueva como cliente (sin token).
export const registrarCliente = (datos) => peticion("/registro", { method: "POST", body: datos });
// loginCliente: entra con mail+password. La contraseña viaja como
// "Basic Auth" (usuario:password codificado en base64) porque el server
// la usa para identificar si es un admin o un cliente.
export const loginCliente = (email, password) => peticion("/login", { method: "POST", headers: { Authorization: `Basic ${btoa(`${email}:${password}`)}` } });
// verificarToken: pregunta al server si el token JWT sigue siendo válido
// (se usa al abrir la app para saber si el usuario sigue logueado).
export const verificarToken = (token) => peticion("/verificar", { token });

// ── Profesionales ─────────────────────────────────────
// obtenerProfesionales: lista activa para el turnero; con incluirInactivos=true
// trae también los que están de baja (para el panel de admin).
export const obtenerProfesionales = (incluirInactivos = false) => peticion(`/profesionales${incluirInactivos ? "?incluirInactivos=1" : ""}`);
// Las acciones de crear/actualizar/eliminar requieren token de admin.
export const crearProfesional = (datos, token) => peticion("/profesionales", { method: "POST", token, body: datos });
export const actualizarProfesional = (id, datos, token) => peticion(`/profesionales/${id}`, { method: "PATCH", token, body: datos });
export const eliminarProfesional = (id, token) => peticion(`/profesionales/${id}`, { method: "DELETE", token });

// ── Servicios ─────────────────────────────────────────
// obtenerServicios: lista de servicios (cortes, tinturas...) sin token.
export const obtenerServicios = () => peticion("/servicios");
export const crearServicio = (datos, token) => peticion("/servicios", { method: "POST", token, body: datos });
export const actualizarServicio = (id, datos, token) => peticion(`/servicios/${id}`, { method: "PATCH", token, body: datos });
export const eliminarServicio = (id, token) => peticion(`/servicios/${id}`, { method: "DELETE", token });

// ── Turnos (cliente y admin) ──────────────────────────
// obtenerTurnosCliente: los turnos de UN cliente (pantalla "Mis turnos").
export const obtenerTurnosCliente = (idCliente, token) => peticion(`/clientes/${idCliente}/turnos`, { token });
// obtenerTurnos: TODOS los turnos, solo para admin (para el panel de agenda).
export const obtenerTurnos = (token) => peticion("/turnos", { token });
// obtenerTurnosDisponibles: horarios ya reservados de un profesional en una fecha.
export const obtenerTurnosDisponibles = (fecha, idProfesional, token) => peticion(`/turnos/disponibles?fecha=${fecha}&idProfesional=${idProfesional}`, { token });
// obtenerTurnosOcupados: todos los turnos ocupados en un rango de fechas
// (se usa para contar cuántos quedan libres por día en el inicio).
export const obtenerTurnosOcupados = (inicio, fin, token) => peticion(`/turnos/ocupados?inicio=${inicio}&fin=${fin}`, { token });
export const reservarTurno = (datos, token) => peticion("/turnos", { method: "POST", token, body: datos });
export const cancelarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}/cancelar`, { method: "PATCH", token });
export const actualizarTurno = (idTurno, datos, token) => peticion(`/turnos/${idTurno}`, { method: "PATCH", token, body: datos });
export const eliminarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}`, { method: "DELETE", token });

// ── Bloqueos y horarios laborales ─────────────────────
// Estos dos endpoints exigen token (exponen la agenda interna del negocio),
// así que hay que pasárselo como en el resto de las llamadas.
// obtenerBloqueos: días/horas que el admin marcó como no disponibles.
export const obtenerBloqueos = (token) => peticion("/bloqueos", { token });
// obtenerHorarios: horario laboral de cada profesional (tabla HorarioLaboral).
export const obtenerHorarios = (token) => peticion("/horarios", { token });
// guardarBloqueos: guarda los bloqueos de un profesional para una fecha.
export const guardarBloqueos = (id, body, token) => peticion(`/profesionales/${id}/bloqueos`, { method: "POST", token, body });
// guardarHorarios: reemplaza el horario semanal de un profesional.
export const guardarHorarios = (id, horarios, token) => peticion(`/profesionales/${id}/horarios`, { method: "PUT", token, body: { horarios } });