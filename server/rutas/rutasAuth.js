const router = require("express").Router();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, JWT_SECRET } = require("../autenticacion");

// ── Helpers de verificación ───────────────────────────
const verificarPassword = async (passwordPlano, hash) => {
  if (!hash) return { ok: false, hash };
  if (String(hash).startsWith("$2")) return { ok: await bcrypt.compare(passwordPlano, hash), hash };
  const ok = passwordPlano === hash;
  return { ok, hash: ok ? await bcrypt.hash(passwordPlano, 10) : hash };
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ── Registro de cliente ───────────────────────────────
// REGISTRO
router.post("/registro", async (req, res) => {
  const { nombre, apellido, email, telefono, password } = req.body;
  if (!nombre || !apellido || !email || !password) {
    return res.status(400).json({ error: "Nombre, apellido, mail y contraseña son obligatorios." });
  }
  try {
    const db = await getPool();
    const emailFinal = String(email).trim().toLowerCase();

    if (!EMAIL_REGEX.test(emailFinal)) {
      return res.status(400).json({ error: "El mail ingresado no es válido." });
    }

    const existe = await db.request()
      .input("email", sql.VarChar, emailFinal)
      .query("SELECT idCliente FROM Cliente WHERE email = @email");
    if (existe.recordset.length > 0) {
      return res.status(409).json({ error: "Ya existe una cuenta con ese mail." });
    }

    const passwordHash = await bcrypt.hash(String(password), 10);
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
// LOGIN
router.post("/login", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "Se requiere autenticación básica (Basic Auth)." });
  }

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = Buffer.from(base64Credentials, "base64").toString("utf-8");
  const colonIndex = credentials.indexOf(":");
  const userOrEmail = colonIndex === -1 ? credentials : credentials.slice(0, colonIndex);
  const password = colonIndex === -1 ? "" : credentials.slice(colonIndex + 1);

  try {
    const db = await getPool();

    // 1) Primero intentamos con un Administrador (usuario + password)
    const adminRes = await db.request()
      .input("usuario", sql.VarChar, userOrEmail)
      .query("SELECT idAdmin, usuario, nombre, apellido, email, password FROM Administrador WHERE usuario = @usuario");

    const admin = adminRes.recordset[0];
    if (admin) {
      const verif = await verificarPassword(password, admin.password);
      if (verif.ok) {
        if (verif.hash !== admin.password) {
          await db.request()
            .input("idAdmin", sql.Int, admin.idAdmin)
            .input("hash", sql.VarChar, verif.hash)
            .query("UPDATE Administrador SET password = @hash WHERE idAdmin = @idAdmin");
        }
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
    }

    // 2) Si no es admin, probamos con un Cliente (email + password)
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
    if (verif.hash !== clienteLogueado.password) {
      await db.request()
        .input("idCliente", sql.Int, clienteLogueado.idCliente)
        .input("hash", sql.VarChar, verif.hash)
        .query("UPDATE Cliente SET password = @hash WHERE idCliente = @idCliente");
    }

    const token = jwt.sign(
      { idCliente: clienteLogueado.idCliente, nombre: clienteLogueado.nombre, role: "client" },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({ 
      mensaje: "Login exitoso.", 
      role: "client",
      token: token,
      cliente: clienteLogueado 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al iniciar sesión." });
  }
});

// ── Verificar token JWT ───────────────────────────────
// VERIFICAR TOKEN (si da 401, el token venció o es inválido)
router.get("/verificar", jwtMiddleware, async (req, res) => {
  res.json({ valido: true, role: req.user.role ?? 'client', idCliente: req.user.idCliente ?? null, idAdmin: req.user.idAdmin ?? null });
});

module.exports = router;