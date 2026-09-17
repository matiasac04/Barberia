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
});