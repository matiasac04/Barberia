// ═══════════════════════════════════════════════════════════════════
// server/index.js — PUNTO DE ENTRADA DEL BACKEND (Express)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Arranca el servidor HTTP que expone la API REST que consume el frontend.
// El flujo completo de una petición:
//
//   Cliente (fetch) → express → MIDDLEWARES (helmet, cors, json, rate limit)
//                   → RUTAS (server/rutas/*.js) → getPool() → SQL Server
//                   ← respuesta JSON ← vuelve por el mismo camino ← al frontend
//
// MIDDLEWARES (se ejecutan EN ORDEN, de arriba hacia abajo):
//   helmet  → cabeceras de seguridad (anti-XSS, CSP, etc.)
//   cors    → permite que el frontend (otro origen) consuma la API
//   json    → parsea body JSON a req.body
//   limiter → frena abuso: máx 300 requests por IP cada 15 min (global)
//   authLimiter → más estricto SOLO en /login y /registro: 20 por 15 min
//     (protege contra ataques de fuerza bruta a contraseñas)
//
// RUTAS: se montan sin prefijo, cada archivo define sus propios paths
// (rutasAuth, rutasClientes, rutasTurnos, rutasProfesionales, rutasServicios).
//
// Si una ruta no matchea ninguna → 404. Si algo lanza excepción → 500
// (los errores se loguean en consola pero NO se filtran al cliente).
//
// require('dotenv').config() lee server/.env ANTES de usar process.env
// (credenciales de la DB y JWT_SECRET).
require('dotenv').config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const rutasAuth = require("./rutas/rutasAuth");
const rutasClientes = require("./rutas/rutasClientes");
const rutasTurnos = require("./rutas/rutasTurnos");
const rutasProfesionales = require("./rutas/rutasProfesionales");
const rutasServicios = require("./rutas/rutasServicios");
const { getPool } = require("./conexion");

// ── Servidor y middleware ─────────────────────────────
// app = la aplicación Express. Acá se le registra todo lo que va a manejar.
const app = express();

app.use(helmet());  // cabeceras de seguridad
app.use(cors());    // CORS abierto (API pública de solo lectura + escritura con JWT)
app.use(express.json());  // body JSON → req.body

// Rate limit GLOBAL: 300 requests / 15 min por IP. Evita que un cliente
// malicioso (o un bug en loop) genere millones de consultas a la DB.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Rate limit para AUTENTICACIÓN: 20 intentos / 15 min por IP en /login y
// /registro. Mucho más estricto: frena ataques de fuerza bruta a contraseñas.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(["/login", "/registro"], authLimiter);

// ── Rutas ─────────────────────────────────────────────
// Cada router se registra con app.use sin prefijo. El path final de cada
// endpoint está definido dentro del router (ej. router.get("/login", ...)).
app.use(rutasAuth);
app.use(rutasClientes);
app.use(rutasTurnos);
app.use(rutasProfesionales);
app.use(rutasServicios);

// ── Manejo de errores ─────────────────────────────────
// 404: ninguna ruta matcheó (catch-all, va después de las rutas reales).
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

// 500: cualquier excepción no manejada en las rutas.
// Se loguea en consola (para el dev) pero al cliente solo se le devuelve un
// mensaje genérico, para no filtrar detalles internos de SQL/infraestructura.
// NOTA: Express detecta este handler de 4 args (err, req, res, next).
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

// ── Iniciar servidor ──────────────────────────────────
// Puerto 3000 por defecto, o el que indique PORT en server/.env.
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor escuchando en el puerto ${PORT}`);

  // Pre-calentado de la conexión a la base. Abrirla contra la nube (DNS, TLS
  // y login) cuesta ~2,4 s medidos; sin esto, ese costo lo paga el PRIMER
  // request de cada arranque, o sea el primer click del usuario. Con esto lo
  // paga el server en el arranque, en segundo plano. No bloquea el arranque
  // (no va con await) y getPool() ya sabe reconectar sola si se cae, así que
  // si falla solo queda un warning: la app sigue igual y reintenta al vuelo.
  getPool().catch((e) => console.error("No se pudo pre-calentar la conexión a la base:", e.message));
});