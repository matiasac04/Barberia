// ── Configuración del JWT ─────────────────────────────
const jwt = require("jsonwebtoken");

if (!process.env.JWT_SECRET) {
  console.error("Falta JWT_SECRET en el entorno (server/.env). El servicio no se puede iniciar sin él.");
  process.exit(1);
}

const JWT_SECRET = process.env.JWT_SECRET;

// ── Middleware de autenticación ───────────────────────
function jwtMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: "Acceso denegado. Token requerido." });
    }

    const token = authHeader.split(' ')[1];

    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        
        req.user = decoded;
        next();
    } catch {
        return res.status(401).json({ error: "Token inválido o expirado." });
    }
}

// ── Middleware de rol admin ───────────────────────────
function requireAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: "Solo el administrador puede realizar esta acción." });
  }
  next();
}

module.exports = { jwtMiddleware, requireAdmin, JWT_SECRET };