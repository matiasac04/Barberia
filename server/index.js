// ── Imports y configuración ───────────────────────────
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
const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(["/login", "/registro"], authLimiter);

// ── Rutas ─────────────────────────────────────────────
app.use(rutasAuth);
app.use(rutasClientes);
app.use(rutasTurnos);
app.use(rutasProfesionales);
app.use(rutasServicios);

// ── Manejo de errores ─────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: "Ruta no encontrada." });
});

app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: "Error interno del servidor." });
});

// ── Iniciar servidor ──────────────────────────────────
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