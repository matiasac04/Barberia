// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   require("jsonwebtoken")           → L33
//   chequeo fail-fast de JWT_SECRET   → L38
//   const JWT_SECRET                  → L50
//   jwtMiddleware(req, res, next)     → L54
//   requireAdmin(req, res, next)      → L88
//   module.exports                    → L103
// ═══════════════════════════════════════════════════════════════════
// server/autenticacion.js — MIDDLEWARES DE SEGURIDAD (JWT + roles)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Dos capas de protección que se aplican como middleware en las rutas:
//
// 1. jwtMiddleware → "¿QUIÉN sos?" (autenticación)
//    Lee el header Authorization: Bearer <token>, lo valida contra
//    JWT_SECRET, y si es válido guarda los datos del token en req.user
//    (idCliente/idAdmin, nombre, role) para que la ruta los use.
//    Si falta o es inválido/expirado → 401 y corta la cadena.
//
// 2. requireAdmin → "¿Sos admin?" (autorización)
//    Se aplica DESPUÉS de jwtMiddleware. Solo pasa si req.user.role === 'admin'.
//    Si no → 403. Por ejemplo un cliente no puede crear servicios.
//
// Orden típico en una ruta:
//    router.post("/servicios", jwtMiddleware, requireAdmin, handler)
//    → primero valida el token, después el rol, después ejecuta.
//
// El token lo firma /login (jsonwebtoken) con 1h de vencimiento. El frontend
// lo guarda en localStorage y lo reenvía en cada request (ver src/servicios/api.js).
const jwt = require("jsonwebtoken");

// Falla RÁPIDO si no hay secreto: es una configuración obligatoria y sin ella
// nadie podría firmar ni verificar tokens. Mejor arrancar y ver el error que
// dejar que acepte tokens firmados con "undefined".
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el entorno (server/.env). El servicio no se puede iniciar sin él.");
  process.exit(1);
}

// El secreto vive en server/.env y no en el código: el repo es público en
// GitHub y quien lo tuviera podría FORJAR tokens a mano (firmar un JWT con
// role 'admin' y entrar al panel sin pasar por el login). Lo usan los dos
// lados: el que firma (login y registro en rutasSesion.js) y el que verifica
// (jwt.verify, abajo), por eso se re-exporta al final del archivo. En Vercel
// el valor se setea en el dashboard, nunca en el repo; si lo cambiás, todos
// los tokens ya emitidos quedan inválidos.
const JWT_SECRET = process.env.JWT_SECRET;

// ── Middleware de autenticación ───────────────────────
// Devuelve la función middleware. Se ejecuta en CADA request que la use.
function jwtMiddleware(req, res, next) {
    // Express guarda todos los headers en minúsculas en req.headers (HTTP los
    // trata como case-insensitive), por eso se lee en minúscula aunque el
    // frontend mande "Authorization: Bearer …" (armado en src/servicios/api.js).
    const authHeader = req.headers.authorization;

    // 401 si no viene header, o no tiene el prefijo "Bearer ".
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Acceso denegado. Token requerido." });
    }

    const token = authHeader.split(' ')[1];  // saca la parte después de "Bearer "

    try {
        // jwt.verify: comprueba firma + expiración. Si falla, lanza excepción.
        // OJO con jwt.decode, que es el que NO conviene usar acá: ese solo
        // decodifica y aceptaría cualquier token armado a mano (con cualquier
        // editor JWT online podrías cambiarle el role a 'admin'). verify
        // recalcula el HMAC con JWT_SECRET y lo compara contra el del header:
        // si el payload se tocó un byte, la firma no cierra y revienta.
        const decoded = jwt.verify(token, JWT_SECRET);

        // Token válido → los claims quedan disponibles para la ruta siguiente.
        req.user = decoded;
        next();  // sigue al siguiente handler
    } catch {
        // Token inválido o expirado → 401.
        return res.status(401).json({ error: "Token inválido o expirado." });
    }
}

// ── Middleware de rol admin ───────────────────────────
// Autorización: solo deja pasar a admins. Asume que jwtMiddleware YA corrió
// (por eso puede leer req.user sin volver a validar el token).
function requireAdmin(req, res, next) {
  // 403 y no 401 a propósito: 401 significa "tu sesión no vale" y el frontend
  // lo usa para expulsar al usuario (error?.status === 401 → expulsarPorSesion
  // en App.jsx). Acá el token SÍ es válido, solo que el rol no alcanza; con un
  // 401 mandarías a un admin de token vigente de vuelta al login por un
  // problema de permisos.
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Solo el administrador puede realizar esta acción." });
  }
  next();
}

// Se exporta JWT_SECRET (exportar el nombre no filtra el valor) para que
// rutasSesion.js firme los tokens de /login y /registro con exactamente el
// mismo secreto con el que este archivo los verifica después.
module.exports = { jwtMiddleware, requireAdmin, JWT_SECRET };