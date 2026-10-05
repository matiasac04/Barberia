// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasAuth.js — REGISTRO, LOGIN Y VERIFICACIÓN DE TOKEN
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es el "portero" de la app. Define 3 endpoints:
//
//   POST /registro  → crea una cuenta de Cliente (sin token)
//   POST /login     → autentica (admin o cliente) y devuelve un JWT
//   GET  /verificar → valida el token y devuelve quién es el usuario
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
const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, JWT_SECRET } = require("../autenticacion");

// ── Helpers de verificación ───────────────────────────
// verificarPassword(textoPlano, hash): compara de forma segura.
// Si no hay hash → falla (no se puede autenticar a alguien sin password).
// Si el hash es bcrypt ($2...) → usa bcrypt.compare.
// Si es texto plano (legacy) → compara strings; si ok, genera hash nuevo.
const verificarPassword = async (passwordPlano, hash) => {
  if (!hash) return { ok: false, hash };
  if (String(hash).startsWith("$2")) return { ok: await bcrypt.compare(passwordPlano, hash), hash };
  const ok = passwordPlano === hash;
  return { ok, hash: ok ? await bcrypt.hash(passwordPlano, 10) : hash };
};

// Regex de email: algo@algo.algo (sin espacios). Validación básica.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Registro de cliente ───────────────────────────────
// POST /registro — crea una cuenta nueva en la tabla Cliente.
// No requiere token (es público). Body: { nombre, apellido, email, telefono, password }
// Validaciones: campos obligatorios, formato de email, no duplicado.
// Password se hashea con bcrypt ANTES de guardar (nunca texto plano).
// Devuelve 201 con el idCliente generado (OUTPUT INSERTED).
router.post("/registro", async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: "Nombre, apellido, mail y contraseña son obligatorios." });
  }
  try {
    const db = await getPool();
    // Normaliza email: trim + minúsculas (evita "Juan@Mail.com" ≠ "juan@mail.com")
    const emailFinal = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }

    // ¿Ya existe una cuenta con ese email? (unicidad)
    const existe = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente FROM Cliente WHERE email = @email");
    if (existe.recordset.length > 0) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese mail." });
    }

    // Hashea la contraseña (bcrypt, 10 rondas). NUNCA guardamos texto plano.
    const passwordHash = await bcrypt.hash(String(password), 10);
    // Inserta el cliente y devuelve el id generado por SQL Server.
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
    res.status(201).json({ mensaje: "Cliente registrado.", idCliente: result.recordset[0].idCliente });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al registrar cliente." });
  }
});

// ── Login (admin o cliente) ───────────────────────────
// POST /login — autentica y devuelve JWT + datos del usuario.
// Header: Authorization: Basic base64(usuario:password)
router.post("/login", async (req, res) => {
  const authHeader = req.headers.authorization;

  // Solo acepta Basic Auth (no JSON).
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Se requiere autenticación básica (Basic Auth)." });
  }

  // Decodifica base64 → "usuario:password". Separa en user y pass por el ":".
  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const colonIndex = credentials.indexOf(":");
  const userOrEmail = colonIndex === -1 ? credentials : credentials.slice(0, colonIndex);
  const password = colonIndex === -1 ? "" : credentials.slice(colonIndex + 1);

  try {
    const db = await getPool();

    // PASO 1: ¿Es un administrador? Busca por `usuario` (no email).
    const adminRes = await db.request()
      .input("usuario", sql.VarChar, userOrEmail)
      .query("SELECT idAdmin, usuario, nombre, apellido, email, password FROM Administrador WHERE usuario = @usuario");

    const admin = adminRes.recordset[0];
    if (admin) {
      const verif = await verificarPassword(password, admin.password);
      if (verif.ok) {
        // Si la pass estaba en texto plano y coincide → la re-hashea ahora.
        if (verif.hash !== admin.password) {
          await db.request()
            .input("idAdmin", sql.Int, admin.idAdmin)
            .input("hash", sql.VarChar, verif.hash)
            .query("UPDATE Administrador SET password = @hash WHERE idAdmin = @idAdmin");
        }
        // Firma JWT con role "admin", expira en 1 hora.
        const token = jwt.sign(
          { idAdmin: admin.idAdmin, usuario: admin.usuario, nombre: admin.nombre, role: "admin" },
          JWT_SECRET,
          { expiresIn: "1h" }
        );
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
    const result = await db.request()
      .input("email", sql.VarChar, String(userOrEmail).trim().toLowerCase())
      .query("SELECT idCliente, nombre, apellido, telefono, password FROM Cliente WHERE email = @email");

    const clienteLogueado = result.recordset[0];
    if (!clienteLogueado) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    const verif = await verificarPassword(password, clienteLogueado.password);
    if (!verif.ok) {
      return res.status(401).json({ error: "Usuario/mail o contraseña incorrectos." });
    }
    // Migra pass legacy a bcrypt si hace falta (mismo patrón que admin).
    if (verif.hash !== clienteLogueado.password) {
      await db.request()
        .input("idCliente", sql.Int, clienteLogueado.idCliente)
        .input("hash", sql.VarChar, verif.hash)
        .query("UPDATE Cliente SET password = @hash WHERE idCliente = @idCliente");
    }

    // Firma JWT con role "client", expira en 1 hora.
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
    const { idCliente, nombre, apellido, telefono } = clienteLogueado;
    res.json({
      mensaje: "Login exitoso.",
      role: "client",
      token: token,
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
  res.json({ valido: true, role: req.user.role ?? 'client', idCliente: req.user.idCliente ?? null, idAdmin: req.user.idAdmin ?? null });
});

module.exports = router;