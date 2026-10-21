// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   API_URL                   → L60
//   peticion()                → L75
//   base64Utf8()              → L119
//   registrarCliente()        → L127
//   loginCliente()            → L131
//   verificarToken()          → L134
//   solicitarRecuperacion()   → L137
//   restablecerPassword()     → L139
//   obtenerProfesionales()    → L145
//   crearProfesional()        → L147
//   actualizarProfesional()   → L148
//   eliminarProfesional()     → L149
//   obtenerServicios()        → L153
//   crearServicio()           → L154
//   actualizarServicio()      → L155
//   eliminarServicio()        → L156
//   obtenerTurnosCliente()    → L160
//   obtenerTurnos()           → L162
//   obtenerTurnosDisponibles()-> L164
//   obtenerTurnosOcupados()   → L167
//   reservarTurno()           → L171
//   cancelarTurno()           → L174
//   actualizarTurno()         → L177
//   eliminarTurno()           → L180
//   obtenerBloqueos()         → L186
//   obtenerHorarios()         → L188
//   guardarBloqueos()         → L190
//   guardarHorarios()         → L192
// ═══════════════════════════════════════════════════════════════════

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
// En producción (Vercel) se define VITE_API_URL en variables de entorno.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3000";

// peticion(): helper genérico para todas las requests.
// Parámetros (opciones):
//   - method: HTTP (GET por defecto)
//   - token:  si existe → agrega Authorization: Bearer <token> (JWT)
//   - body:   si existe → JSON.stringify + Content-Type: application/json
//   - headers: extras que se mezclan
// Comportamiento:
//   - Envuelve el fetch para que un backend caído no reviente con el mensaje
//     técnico de fetch ("Failed to fetch"), que el usuario no entiende
//   - Lee respuesta, intenta parsear JSON (catch → {} si no es JSON)
//   - Si res.ok → devuelve data. Si no → crea Error con data.error o genérico
//     y le agrega .status = res.status (útil para 401/403/409/429)
//   - Lanza excepción al llamador (quien decide cómo mostrar feedback)
const peticion = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  // Los spreads arman los headers en orden: primero auth, después
  // Content-Type y al final `headers` (los extras), que SIEMPRE pisan
  // cualquier clave anterior por si el llamador necesita forzar algo
  // (por ejemplo el Basic Auth del login, que va sin body).
  const h = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}), ...headers };
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers: h, ...(body ? { body: JSON.stringify(body) } : {}) });
  } catch {
    // fetch solo rechaza si no hubo respuesta: backend caído, sin internet o
    // CORS bloqueando. Sin este catch, el catch de arriba de App.jsx terminaba
    // mostrando el error crudo de fetch.
    const err = new Error("No pudimos conectar con el servidor. Revisá que esté levantado y que tu conexión a internet esté bien.");
    err.status = 0;
    throw err;
  }
  // .json() también puede fallar si la respuesta no es JSON (por ejemplo un
  // proxy o Vercel devolviendo HTML de error): el catch la deja como {} para
  // que el manejo de errores de abajo genere un mensaje genérico en vez de reventar.
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Error en la solicitud al servidor.");
    err.status = res.status;
    // 429: el rate limiter. El server ya manda un mensaje claro en JSON
    // (ver message en server/index.js), así que normalmente data.error alcanza.
    // El extra es para cuando el body no es JSON (un proxy/hosting puede
    // responder 429 con texto plano o HTML) y para mostrar cuánto esperar.
    if (res.status === 429) {
      const esperar = Number(res.headers.get("Retry-After"));
      err.message = data.error || "Demasiados intentos. Esperá un momento y volvé a intentar.";
      if (Number.isFinite(esperar) && esperar > 0) {
        const min = Math.ceil(esperar / 60);
        err.message += ` Podés volver a intentar en unos ${min} minuto${min === 1 ? "" : "s"}.`;
      }
    }
    throw err;
  }
  return data;
};

// base64Utf8: btoa() solo acepta Latin-1, así que una contraseña con ñ, acentos
// o emoji lanzaba InvalidCharacterError y no dejaba iniciar sesión. Se codifica
// primero a UTF-8 byte por byte (el backend decodifica con Buffer en utf-8).
const base64Utf8 = (texto) => {
  let binario = '';
  for (const byte of new TextEncoder().encode(texto)) binario += String.fromCharCode(byte);
  return btoa(binario);
};

// ── Autenticación ─────────────────────────────────────
// registrarCliente: alta de cuenta nueva como cliente (sin token).
export const registrarCliente = (datos) => peticion("/registro", { method: "POST", body: datos });
// loginCliente: entra con mail+password. La contraseña viaja como
// "Basic Auth" (usuario:password codificado en base64) porque el server
// la usa para identificar si es un admin o un cliente.
export const loginCliente = (email, password) => peticion("/login", { method: "POST", headers: { Authorization: `Basic ${base64Utf8(`${email}:${password}`)}` } });
// verificarToken: pregunta al server si el token JWT sigue siendo válido
// (se usa al abrir la app para saber si el usuario sigue logueado).
export const verificarToken = (token) => peticion("/verificar", { token });
// solicitarRecuperacion: pide por mail el link para restablecer la clave.
// El backend responde lo mismo exista o no la cuenta (anti-enumeración).
export const solicitarRecuperacion = (email) => peticion("/recuperar", { method: "POST", body: { email } });
// restablecerPassword: cambia la clave con el token que vino en el link.
export const restablecerPassword = (token, password) => peticion("/restablecer", { method: "POST", body: { token, password } });

// ── Profesionales ─────────────────────────────────────
// obtenerProfesionales: lista activa para el turnero; con incluirInactivos=true
// trae también los que están de baja (para el panel de admin).
// Pide token porque el endpoint devuelve email y teléfono del staff.
export const obtenerProfesionales = (token, incluirInactivos = false) => peticion(`/profesionales${incluirInactivos ? "?incluirInactivos=1" : ""}`, { token });
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
export const obtenerTurnosDisponibles = (fecha, idProfesional, token) => peticion(`/turnos/disponibles?fecha=${encodeURIComponent(fecha)}&idProfesional=${encodeURIComponent(idProfesional)}`, { token });
// obtenerTurnosOcupados: todos los turnos ocupados en un rango de fechas
// (se usa para contar cuántos quedan libres por día en el inicio).
export const obtenerTurnosOcupados = (inicio, fin, token) => peticion(`/turnos/ocupados?inicio=${encodeURIComponent(inicio)}&fin=${encodeURIComponent(fin)}`, { token });
// reservarTurno: crea el turno (POST /turnos). El backend lo rechaza con 400
// si el día está cerrado, si la fecha está fuera de la ventana de 30 días o
// si la hora elegida ya pasó.
export const reservarTurno = (datos, token) => peticion("/turnos", { method: "POST", token, body: datos });
// cancelarTurno: usa PATCH /cancelar y NO DELETE porque la cancelación es
// LÓGICA: el estado pasa a 'Cancelado' y el registro se conserva en la DB.
export const cancelarTurno = (idTurno, token) => peticion(`/turnos/${idTurno}/cancelar`, { method: "PATCH", token });
// actualizarTurno: edición parcial (fecha, hora, estado, datos del cliente);
// solo los campos enviados en `datos` se modifican en la DB (comportamiento PATCH).
export const actualizarTurno = (idTurno, datos, token) => peticion(`/turnos/${idTurno}`, { method: "PATCH", token, body: datos });
// eliminarTurno: borrado FÍSICO (el registro desaparece de la DB, sin
// confirmación en el backend). Uso exclusivo del panel de admin.
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