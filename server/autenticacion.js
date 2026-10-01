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
// dejarlo accepting tokens firmados con "undefined".
if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el entorno (server/.env). El servicio no se puede iniciar sin él.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

// ── Middleware de autenticación ───────────────────────
// Devuelve la función middleware. Se ejecuta en CADA request que la use.
function jwtMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    // 401 si no viene header, o no tiene el prefijo "Bearer ".
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Acceso denegado. Token requerido." });
    }

    const token = authHeader.split(' ')[1];  // saca la parte después de "Bearer "

    try {
        // jwt.verify: comprueba firma + expiración. Si falla, lanza excepción.
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
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Solo el administrador puede realizar esta acción." });
  }
  next();
}

module.exports = { jwtMiddleware, requireAdmin, JWT_SECRET };