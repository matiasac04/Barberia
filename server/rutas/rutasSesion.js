// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasSesion.js — REGISTRO, LOGIN, TOKEN Y RECUPERACIÓN DE CLAVE
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es el "portero" de la app. Define 5 endpoints:
//
//   POST /registro     → crea una cuenta de Cliente (sin token)
//   POST /login        → autentica (admin o cliente) y devuelve un JWT
//   GET  /verificar    → valida el token y devuelve quién es el usuario
//   POST /recuperar    → manda por mail un link para restablecer la clave
//   POST /restablecer  → cambia la clave usando el token de ese link
//
// MECANISMO DE LOGIN (el más interesante):
// El frontend manda mail+contraseña como "Basic Auth" (base64 de user:pass).
// El backend no sabe si es admin o cliente, así que Prueba en este orden:
//   1. ¿Existe un ADMINISTRADOR con ese `usuario`? → compara pass → si ok,
//      firma JWT con role:"admin"
//   2. Si no, ¿existe un CLIENTE con ese `email`? → compara pass → si ok,
//      firma JWT con role:"client"
//   3. Si ninguno → 401.
//
// DETALLE IMPORTANTE: verificarPassword maneja dos casos (compatibilidad
// hacia atrás con datos ya cargados):
//   - Hash bcrypt (empieza con "$2"): usa bcrypt.compare (correcto y seguro)
//   - Texto plano (datos viejos): compara con === y si coincide, RE-HASHEA
//     con bcrypt y actualiza la fila. Así las cuentas viejas van migrando
//     solas al formato seguro la próxima vez que alguien inicia sesión.
//   (En ambos casos devuelve { ok, hash }: si hubo migración, hash es el nuevo.)
//
// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y endpoints (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   verificarPassword()          → L73
//   hashToken()                  → L91
//   POST   /registro             → L99   (público, sin token)
//   POST   /login                → L187  (público, Basic Auth base64 user:pass)
//   GET    /verificar            → L322  (jwt)
//   POST   /recuperar            → L335  (público, manda link por mail)
//   POST   /restablecer          → L396  (público, token de un solo uso)
// ═══════════════════════════════════════════════════════════════════
// `router` is the contenedor de Express donde se definen las tres rutas de
// este archivo; `jwt` firma y verifica tokens; `bcrypt` hashea y compara
// contraseñas (acá nunca se guarda ni se compara una contraseña en texto plano
// sin pasar por él).
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
// `crypto` (módulo nativo de Node) genera el token aleatorio de recuperación
// con randomBytes y calcula su SHA-256 para guardarlo en la base.
const crypto = require("crypto");

// `getPool()` devuelve la promesa con la conexión compartida a SQL Server (el
// pool lo reutiliza todo el servidor) y `sql` aporta los tipos (VarChar, Int...)
// con los que se parametrizan los .input() de cada query.
const { sql, getPool } = require("../conexion");
// `jwtMiddleware` es la barrera de las rutas con token (401 si falta o venció)
// y deja el payload decodificado en req.user; `JWT_SECRET` es la clave con la
// que /login firma y con la que después se valida ese token.
const { jwtMiddleware, JWT_SECRET } = require("../autenticacion");
// `errorPassword` aplica las reglas de fortaleza en el registro (mínimo 8
// caracteres y tope de 72 BYTES, que es donde bcrypt.js corta el texto).
const { errorPassword } = require("../validaciones");
// `enviarMail` manda el correo por Gmail y `htmlRecuperacionPassword` arma el
// HTML del link de recuperación (ver server/mailer.js).
const { enviarMail, htmlRecuperacionPassword } = require("../mailer");

// ── Helpers de verificación ───────────────────────────
// verificarPassword(textoPlano, hash): compara de forma segura.
// Si no hay hash → falla (no se puede autenticar a alguien sin password).
// Si el hash es bcrypt ($2...) → usa bcrypt.compare.
// Si es texto plano (legacy) → compara strings; si ok, genera hash nuevo.
const verificarPassword = async (passwordPlano, hash) => {
  if (!hash) return { ok: false, hash };
  // Un hash bcrypt siempre arranca con "$2" (versión y costo, p. ej.
  // "$2a$10$..."). Ese prefijo es lo que separa un hash real de una contraseña
  // vieja guardada en texto plano; por eso el if de abajo decide qué camino usar.
  if (String(hash).startsWith("$2")) return { ok: await bcrypt.compare(passwordPlano, hash), hash };
  const ok = passwordPlano === hash;
  return { ok, hash: ok ? await bcrypt.hash(passwordPlano, 10) : hash };
};

// Regex de email: algo@algo.algo (sin espacios). Validación básica.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// hashToken(token): devuelve el SHA-256 en hex (64 caracteres) del token que
// viaja en el link del mail. En la base se guarda SOLO este hash, igual que
// una contraseña: si alguien lee la tabla, no puede usar el token para entrar.
// Como el token es aleatorio de 256 bits, no hace falta bcrypt acá (no se puede
// adivinar por fuerza bruta); SHA-256 alcanza y es instantáneo.
const hashToken = (token) => crypto.createHash("sha256").update(String(token)).digest("hex");

// ── Registro de cliente ───────────────────────────────
// POST /registro — crea una cuenta nueva en la tabla Cliente.
// No requiere token (es público). Body: { nombre, apellido, email, telefono, password }
// Validaciones: campos obligatorios, formato de email, no duplicado.
// Password se hashea con bcrypt ANTES de guardar (nunca texto plano).
// Devuelve 201 con el idCliente generado (OUTPUT INSERTED).
router.post("/registro", async (req, res) => {
  // req.body lo arma express.json() (middleware global en index.js). Si el
  // body venía incompleto, los faltantes llegan como undefined y los chequeos
  // de abajo los detectan.
  const { nombre, apellido, email, telefono, password } = req.body;
  // Primera barrera y es barata: los obligatorios se chequean ANTES de tocar
  // la base (regla del proyecto: ningún input del cliente debe provocar un 500).
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: "Nombre, apellido, mail y contraseña son obligatorios." });
  }
  try {
    // getPool() resuelve con la conexión lista; el pool es el mismo que usa
    // el resto de los endpoints.
    const db = await getPool();
    // Normaliza email: trim + minúsculas (evita "Juan@Mail.com" ≠ "juan@mail.com")
    const emailFinal = String(email).trim().toLowerCase();

    // El chequeo de obligatorios de arriba solo pregunta "vino algo?"; acá se
    // valida la FORMA con la regex EMAIL_REGEX (un "a" sin "@" no llega nunca
    // a la base).
    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }

    // Longitud mínima y máxima de la contraseña. Antes no había mínimo: se
    // podía registrar con password "1" (verificado, devolvía 201). Con login
    // por email, una contraseña de un carácter se adivina por fuerza bruta en
    // nada, y la única defensa es el rate limit de 20 intentos cada 15 min.
    const errPass = errorPassword(password);
    if (errPass) return res.status(400).json({ error: errPass });

    // Las columnas son VARCHAR(100)/VARCHAR(20): sin tope de longitud, un
    // nombre de 300 caracteres revienta con error 2628 de truncamiento y la
    // API responde 500 en vez de un 400 que diga qué pasó.
    if (String(nombre).length > 100 || String(apellido).length > 100) {
      return res.status(400).json({ error: "Nombre y apellido no pueden superar los 100 caracteres." });
    }
    if (telefono != null && String(telefono).length > 20) {
      return res.status(400).json({ error: "El teléfono no puede superar los 20 caracteres." });
    }

    // ¿Ya existe una cuenta con ese email? (unicidad)
    // SELECT mínimo (solo el id) sobre la tabla Cliente con WHERE por el mail
    // YA normalizado, igual que lo va a normalizar el login: ambas rutas
    // buscan el valor con exactamente la misma forma que se guardó.
    const existe = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente FROM Cliente WHERE email = @email");
    if (existe.recordset.length > 0) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese mail." });
    }

    // Hashea la contraseña (bcrypt, 10 rondas). NUNCA guardamos texto plano.
    const passwordHash = await bcrypt.hash(String(password), 10);
    // Inserta el cliente y devuelve el id generado por SQL Server.
    // Todos los valores viajan en .input() con @variables: mssql envía los
    // parámetros por separado del texto SQL, así que lo que escriba el usuario
    // queda como dato y nunca como instrucción (anti inyección SQL).
    // OUTPUT INSERTED.idCliente devuelve el id recién creado en la MISMA
    // consulta, sin necesidad de un SELECT SCOPE_IDENTITY() aparte: es una
    // sola ida a la base en vez de dos.
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("apellido", sql.VarChar, apellido)
      .input("email", sql.VarChar, emailFinal)
      .input("telefono", sql.VarChar, telefono || null)
      .input("password", sql.VarChar, passwordHash)
      .query(`
        INSERT INTO Cliente (nombre, apellido, email, telefono, password)
        OUTPUT INSERTED.idCliente
        VALUES (@nombre, @apellido, @email, @telefono, @password)
      `);
    // 201 Created (no 200: nació un recurso nuevo) + el id autogenerado. El
    // frontend lo guarda dentro de "currentUser" en localStorage junto al token
    // (src/App.jsx) y lo usa como idCliente en todos los turnos.
    res.status(201).json({ mensaje: "Cliente registrado.", idCliente: result.recordset[0].idCliente });
  } catch (error) {
    // El detalle real (caída de DB, violación de constraint) queda en la
    // consola del servidor; al navegador solo le llega un 500 genérico para
    // no filtrar información interna.
    console.error(error);
    res.status(500).json({ error: "Error al registrar cliente." });
  }
});

// ── Login (admin o cliente) ───────────────────────────
// POST /login — autentica y devuelve JWT + datos del usuario.
// Header: Authorization: Basic base64(usuario:password)
router.post("/login", async (req, res) => {
  // Header crudo que manda el frontend (src/servicios/api.js). Express no lo
  // parsea: hay que leerlo y decodificarlo a mano.
  const authHeader = req.headers.authorization;

  // Solo acepta Basic Auth (no JSON).
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Se requiere autenticación básica (Basic Auth)." });
  }

  // Decodifica base64 → "usuario:password". Separa en user y pass por el ":".
  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  // indexOf(":") y no split(":"): si la contraseña contiene dos puntos, el
  // split cortaría en el primero y la clave quedaría truncada. Acá todo lo que
  // siga al primer ":" queda entero como contraseña.
  const colonIndex = credentials.indexOf(":");
  // Si el header viniera sin ":" (mal formado), userOrEmail es la cadena
  // entera y password queda vacío: no matchea a nadie y se responde 401.
  const userOrEmail = colonIndex === -1 ? credentials : credentials.slice(0, colonIndex);
  const password = colonIndex === -1 ? "" : credentials.slice(colonIndex + 1);

  try {
    const db = await getPool();

    // PASO 1: ¿Es un administrador? Busca por `usuario` (no email).
    // Tabla Administrador, WHERE por la columna `usuario`: el mail del admin no
    // sirve para entrar (si alguien escribe el mail del admin acá, este SELECT
    // no trae fila y el intento sigue como cliente).
    // El SELECT trae password porque es lo que compara verificarPassword.
    const adminRes = await db.request()
      .input("usuario", sql.VarChar, userOrEmail)
      .query("SELECT idAdmin, usuario, nombre, apellido, email, password FROM Administrador WHERE usuario = @usuario");

    // recordset[0] es undefined si nadie tiene ese usuario → el bloque de
    // abajo ni se abre y el flujo sigue al paso 2.
    const admin = adminRes.recordset[0];
    if (admin) {
      const verif = await verificarPassword(password, admin.password);
      if (verif.ok) {
        // Si la pass estaba en texto plano y coincide → la re-hashea ahora.
        // La diferencia solo aparece cuando hubo migración: si el hash ya era
        // bcrypt, verificarPassword devuelve el mismo string de siempre y no
        // se gasta un UPDATE en cada login.
        if (verif.hash !== admin.password) {
          await db.request()
            .input("idAdmin", sql.Int, admin.idAdmin)
            .input("hash", sql.VarChar, verif.hash)
            .query("UPDATE Administrador SET password = @hash WHERE idAdmin = @idAdmin");
        }
        // Firma JWT con role "admin", expira en 1 hora.
        // El payload es lo que después lee req.user en cualquier ruta:
        // `role: "admin"` es justamente lo que requireAdmin compara más adelante.
        const token = jwt.sign(
          { idAdmin: admin.idAdmin, usuario: admin.usuario, nombre: admin.nombre, role: "admin" },
          JWT_SECRET,
          { expiresIn: "1h" }
        );
        // Objeto armado campo por campo (nunca la fila cruda que trajo el
        // SELECT): así el hash de la contraseña no aparece en la respuesta,
        // igual que en el login de cliente.
        return res.json({
          mensaje: "Login de administrador exitoso.",
          role: "admin",
          token,
          admin: { idAdmin: admin.idAdmin, usuario: admin.usuario, nombre: admin.nombre, apellido: admin.apellido, email: admin.email }
        });
      }
      // Si es admin pero la pass no coincide, no probamos como cliente (evita
      // que alguien con el usuario de un admin entre como cliente).
    }

    // PASO 2: No era admin → probar como Cliente (busca por email).
    // Tabla Cliente, WHERE por email; se aplica trim() y minúsculas igual que
    // en /registro, así el valor que se busca es el mismo que se guardó.
    const result = await db.request()
      .input("email", sql.VarChar, String(userOrEmail).trim().toLowerCase())
      .query("SELECT idCliente, nombre, apellido, telefono, password FROM Cliente WHERE email = @email");

    const clienteLogueado = result.recordset[0];
    // 401 con el MISMO texto que el que se devuelve cuando falla la
    // contraseña: así no se revela si el mail tiene cuenta o no, y nadie puede
    // enumerar usuarios probando direcciones.
    if (!clienteLogueado) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    const verif = await verificarPassword(password, clienteLogueado.password);
    if (!verif.ok) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    // Migra pass legacy a bcrypt si hace falta (mismo patrón que admin).
    // Importa hacerlo UNA sola vez: sin este UPDATE, la cuenta seguiría
    // comparando contra texto plano en todos los logins futuros.
    if (verif.hash !== clienteLogueado.password) {
      await db.request()
        .input("idCliente", sql.Int, clienteLogueado.idCliente)
        .input("hash", sql.VarChar, verif.hash)
        .query("UPDATE Cliente SET password = @hash WHERE idCliente = @idCliente");
    }

    // Firma JWT con role "client", expira en 1 hora.
    // Este token es el que el frontend manda después como "Bearer ..." y del
    // que jwtMiddleware saca idCliente (clave para el anti-IDOR de /clientes).
    const token = jwt.sign(
      { idCliente: clienteLogueado.idCliente, nombre: clienteLogueado.nombre, role: "client" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    // OJO: se responde con un objeto NUEVO, no con la fila que trajo el
    // SELECT. La fila cruda incluye `password` (el hash de bcrypt) y mandarlo
    // al navegador lo dejaría expuesto en el devtools y en cualquier
    // interceptación de la respuesta. El frontend solo usa idCliente, nombre,
    // apellido, telefono y email, así que se devuelven solo esos.
    // La desestructuración deja afuera a `password` a propósito: esa variable
    // nunca entra al objeto de respuesta.
    const { idCliente, nombre, apellido, telefono } = clienteLogueado;
    res.json({
      mensaje: "Login exitoso.",
      role: "client",
      token: token,
      // El email se vuelve a normalizar acá porque la fila del SELECT no lo
      // trajo (no hacía falta para comparar): se reusa userOrEmail.
      cliente: { idCliente, nombre, apellido, telefono, email: String(userOrEmail).trim().toLowerCase() }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al iniciar sesión." });
  }
});

// ── Verificar token JWT ───────────────────────────────
// GET /verificar — el frontend lo llama al abrir la app para saber si la
// sesión sigue viva. Si el token es válido → 200 con { valido: true, role, ids }.
// Si está expirado/inválido → 401 (jwtMiddleware corta antes del handler).
router.get("/verificar", jwtMiddleware, async (req, res) => {
  // Si el flujo llegó hasta acá, jwtMiddleware YA validó firma y vencimiento y
  // dejó el payload decodificado en req.user; por eso se responde siempre 200.
  // Los "?? 'client'" / "?? null" son red de seguridad por si un token viejo
  // no trajera esos claims: el frontend recibe un objeto completo igual.
  res.json({ valido: true, role: req.user.role ?? 'client', idCliente: req.user.idCliente ?? null, idAdmin: req.user.idAdmin ?? null });
});

// ── Recuperación de contraseña ────────────────────────
// POST /recuperar — pide un link de recuperación para un mail.
// Body: { email }. La respuesta es SIEMPRE el mismo mensaje, exista o no la
// cuenta, para que nadie pueda averiguar qué mails están registrados
// (protección contra enumeración de usuarios).
router.post("/recuperar", async (req, res) => {
  const mensaje = "Si el mail está registrado, te enviamos un link para restablecer tu contraseña.";
  try {
    const emailFinal = String(req.body?.email ?? "").trim().toLowerCase();
    // Un mail mal formado se rechaza con 400: no revela si existe una cuenta,
    // solo que el texto no tiene forma de mail.
    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente, nombre FROM Cliente WHERE email = @email");
    const cliente = result.recordset[0];
    // Si no existe la cuenta se responde lo mismo y no se manda nada.
    if (!cliente) return res.json({ mensaje });

    // Token aleatorio de 32 bytes (256 bits) → 64 caracteres hex. Es
    // impredecible y de un solo uso; en la DB guardamos su hash (ver hashToken).
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    // Reemplaza cualquier pedido anterior: solo el último link enviado sirve.
    // DATEADD(minute, 60, GETDATE()) fija la expiración en 1 hora calculada
    // por SQL Server, así no dependemos del reloj de Node.
    await db.request()
      .input("idCliente", sql.Int, cliente.idCliente)
      .input("token", sql.VarChar, tokenHash)
      .query(`
        UPDATE Cliente
        SET tokenRecuperacion = @token, tokenExpira = DATEADD(minute, 60, GETDATE())
        WHERE idCliente = @idCliente
      `);

    // El link apunta al FRONTEND, no al backend: la pantalla de la SPA es la
    // que pide la nueva contraseña y llama a POST /restablecer.
    const base = process.env.FRONTEND_URL || "http://localhost:5173";
    const enlace = `${base}/?reset=${token}`;

    // Se espera el envío ANTES de responder: en Vercel la función puede
    // congelarse apenas responde y el SMTP pendiente se perdería (por eso
    // antes los mails llegaban "a veces"). El catch mantiene la respuesta
    // genérica aunque Gmail falle, para no revelar si la cuenta existe.
    try {
      await enviarMail({
        para: emailFinal,
        asunto: "Recuperá tu contraseña — Barberia",
        html: htmlRecuperacionPassword({ nombre: cliente.nombre, enlace }),
      });
    } catch (error) {
      console.error("No se pudo enviar el mail de recuperación:", error.message);
    }

    return res.json({ mensaje });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al solicitar la recuperación de contraseña." });
  }
});

// POST /restablecer — cambia la contraseña usando el token del link.
// Body: { token, password }.
router.post("/restablecer", async (req, res) => {
  try {
    const token = String(req.body?.token ?? "").trim();
    const password = req.body?.password;
    // El token guardado es un SHA-256 hex: si no mide 64, ni consultamos la DB.
    if (token.length !== 64) {
      return res.status(400).json({ error: "El link no es válido o venció. Pedí uno nuevo." });
    }
    if (!password) {
      return res.status(400).json({ error: "La nueva contraseña es obligatoria." });
    }
    // Mismas reglas que en el registro (mínimo 8 / máximo 72 bytes).
    const errPass = errorPassword(password);
    if (errPass) return res.status(400).json({ error: errPass });

    const db = await getPool();
    const tokenHash = hashToken(token);
    // Busca SOLO tokens vigentes: tokenExpira se compara contra la hora actual
    // de SQL Server. Un token vencido o ya usado (NULL) no devuelve fila.
    const result = await db.request()
      .input("token", sql.VarChar, tokenHash)
      .query("SELECT idCliente FROM Cliente WHERE tokenRecuperacion = @token AND tokenExpira > GETDATE()");
    const cliente = result.recordset[0];
    if (!cliente) {
      return res.status(400).json({ error: "El link no es válido o venció. Pedí uno nuevo." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
    // Actualiza la clave y limpia el token en la MISMA consulta: el link queda
    // de un solo uso y no puede volver a usarse.
    await db.request()
      .input("idCliente", sql.Int, cliente.idCliente)
      .input("password", sql.VarChar, passwordHash)
      .query(`
        UPDATE Cliente
        SET password = @password, tokenRecuperacion = NULL, tokenExpira = NULL
        WHERE idCliente = @idCliente
      `);

    res.json({ mensaje: "Contraseña actualizada. Ya podés iniciar sesión." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al restablecer la contraseña." });
  }
});

// Se exporta el router y index.js lo monta con app.use(rutasSesion), sin
// prefijo: por eso los paths de acá son "/registro", "/login", "/verificar",
// "/recuperar" y "/restablecer".
module.exports = router;