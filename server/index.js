// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   require('dotenv') config         → L47
//   imports (express, cors, rutas)   → L49
//   const app = express()            → L63
//   app.set("trust proxy", 1)        → L81
//   helmet()                         → L89
//   cors()                           → L97
//   express.json()                   → L102
//   limiter (global 300/15 min)      → L106
//   authLimiter (login/registro/recuperar/restablecer) → L125
//   rutas montadas (5 routers)       → L147
//   middleware 404                   → L155
//   middleware 500                   → L163
//   const PORT                       → L174
//   app.listen + pre-calentado       → L176
//   module.exports = app             → L191
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
//   authLimiter → más estricto en /login, /registro, /recuperar y
//     /restablecer: 20 por 15 min (fuerza bruta y spam de mails)
//
// RUTAS: se montan sin prefijo, cada archivo define sus propios paths
// (rutasSesion, rutasClientes, rutasTurnos, rutasProfesionales, rutasServicios).
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

const rutasSesion = require("./rutas/rutasSesion");
const rutasClientes = require("./rutas/rutasClientes");
const rutasTurnos = require("./rutas/rutasTurnos");
const rutasProfesionales = require("./rutas/rutasProfesionales");
const rutasServicios = require("./rutas/rutasServicios");
const { getPool } = require("./conexion");

// ── Servidor y middleware ─────────────────────────────
// app = la aplicación Express. Acá se le registra todo lo que va a manejar.
const app = express();

// ── trust proxy (OBLIGATORIO antes de los rate limiters) ───────────
//
// Sin esto, Express ve TODAS las requests como si vinieran de la IP interna
// del servidor, así que los dos rate limiters de abajo cuentan para toda la
// app junta. En local no molesta (todo viene de 127.0.0.1) pero en Vercel el
// tráfico pasa por el proxy del hosting: las 20 cuentas de /login y las 300
// requests globales serían UN SOLO cubo compartido. Con dos personas usando la
// app al mismo tiempo, el tercero que entra recibe 429 y no puede iniciar
// sesión.
//
// El "1" dice: confiá en exactamente un salto de proxy (el del hosting).
// Confiar más (o en true) permitiría que un cliente falseara
// X-Forwarded-For y evadiera los límites.
//
// Va antes de app.use(limiter) a propósito: el middleware lee req.ip en el
// momento en que se registra la request.
app.set("trust proxy", 1);

// helmet solo agrega cabeceras de seguridad a la respuesta; no toca rutas ni
// lógica. Los defaults de la librería ya frenan el clickjacking (que otro
// sitio embeba nuestras respuestas dentro de un iframe), el MIME sniffing
// (que el navegador adivine el tipo de contenido) y la fuga del Referer hacia
// otros dominios. No hace falta configurarlo: esta API solo devuelve JSON, las
// reglas estrictas (CSP) no aplican a páginas que nosotros no servimos.
app.use(helmet());  // cabeceras de seguridad
// cors() sin opciones deja que CUALQUIER origen llame a la API desde su
// navegador (Access-Control-Allow-Origin: *). Es un trade-off deliberado: no
// usamos cookies de sesión (el JWT viaja en el header Authorization, que el
// navegador nunca manda solo), así que un sitio ajeno puede leer los GET
// públicos, pero no puede hacer escrituras sin tener el token a mano. Si
// algún día se pasa a cookies con credenciales, hay que restringir acá la
// lista de orígenes permitidos.
app.use(cors());    // CORS abierto (API pública de solo lectura + escritura con JWT)
// express.json() convierte los bodies application/json en req.body. Va ANTES
// de las rutas: sin él req.body quedaría undefined y todo POST/PATCH moriría.
// Además limita el payload a 100 kB: un body gigante se rechaza con 413 en
// vez de quedarse comiendo memoria del servidor.
app.use(express.json());  // body JSON → req.body

// Rate limit GLOBAL: 300 requests / 15 min por IP. Evita que un cliente
// malicioso (o un bug en loop) genere millones de consultas a la DB.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  // standardHeaders manda los headers RateLimit-* de la versión vigente del
  // estándar (los que hoy leen los proxies y el frontend para saber cuánto
  // queda de cuota); legacyHeaders:false apaga los viejos X-RateLimit-*, que
  // pertenecen a una especificación descartada y quedarían redundantes.
  standardHeaders: true,
  legacyHeaders: false,
  // El 429 tiene que ser JSON: el frontend hace res.json() y si le llega
  // texto plano cae en el catch y muestra "Error en la solicitud al servidor."
  // en vez de "demasiados intentos, esperá un rato".
  message: { error: "Demasiadas consultas. Esperá un rato y volvé a intentar." },
});
app.use(limiter);

// Rate limit para AUTENTICACIÓN: 20 intentos / 15 min por IP en /login,
// /registro, /recuperar y /restablecer. Mucho más estricto: frena ataques de
// fuerza bruta a contraseñas y el spam de mails de recuperación.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  // Mismos headers que el limiter global (RateLimit-* vigentes, sin los
  // viejos X-RateLimit-*).
  standardHeaders: true,
  legacyHeaders: false,
  // Mismo motivo que el global: el 429 tiene que ser JSON para que el
  // frontend pueda mostrar un mensaje útil en vez de "Error en la solicitud".
  message: { error: "Demasiados intentos de acceso. Esperá 15 minutos y volvé a intentar." },
});
// El array registra el mismo middleware en cada path sin repetir app.use.
// Los paths son los finales, sin prefijo (igual que los routers de abajo).
// /recuperar entra acá para que no se pueda usar como generador de mails y
// /restablecer porque recibe una contraseña nueva (mismo riesgo de fuerza
// bruta que el login). Si algún día aparece otro endpoint que reciba
// contraseñas, hay que sumarlo acá o queda sin freno.
app.use(["/login", "/registro", "/recuperar", "/restablecer"], authLimiter);

// ── Rutas ─────────────────────────────────────────────
// Cada router se registra con app.use sin prefijo. El path final de cada
// endpoint está definido dentro del router (ej. router.get("/login", ...)).
app.use(rutasSesion);
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
// El 3000 no es casual: en local el frontend apunta a http://localhost:3000
// (src/servicios/api.js), así que ambos lados tienen que coincidir. En Vercel
// el hosting inyecta su propio PORT en el entorno y acá lo tomamos tal cual,
// sin cambiar código.
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

// Export de la app: es la forma que Vercel usa para detectar Express y
// empaquetarlo como Function (zero-config). En local no cambia nada:
// `node index.js` igual entra por el app.listen de arriba.
module.exports = app;