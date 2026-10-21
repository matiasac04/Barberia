// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasServicios.js — CRUD DEL CATÁLOGO DE SERVICIOS
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// El catálogo de servicios (corte, barba, tinte...) que el cliente elige en
// el paso 1 del turnero. Cuatro endpoints:
//
//   GET    /servicios       → lista (PÚBLICO, sin token: el turnero la usa
//                             apenas entra, incluso antes de saber el rol)
//   POST   /servicios       → crea        (solo admin)
//   PATCH  /servicios/:id   → actualiza   (solo admin)
//   DELETE /servicios/:id   → elimina     (solo admin)
//
// Los PATCH son "parciales": solo se actualizan los campos que vienen
// definidos en el body. Se arma dinámicamente el SET de la consulta SQL
// (por eso se concatenan `set.push(...)` y se hace `.join(", ")` al final).
// Así un body { precio: 5000 } no borra el nombre ni la duración.
//
// ELIMINAR TIENE TRAMPA (y por eso el catch es especial):
// Si el servicio ya está en turnos viejos, la FK de SQL Server lo impide.
// El error llega con number = 547. En vez de un 500 genérico, se devuelve un
// 409 con un mensaje entendible ("hay turnos cargados con él").
//
// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y endpoints (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   GET    /servicios      → L46   (público, sin token)
//   POST   /servicios      → L64   (jwt + admin)
//   PATCH  /servicios/:id  → L97   (jwt + admin)
//   DELETE /servicios/:id  → L131  (jwt + admin)
// ═══════════════════════════════════════════════════════════════════
const router = require("express").Router();

// `sql` aporta los tipos para parametrizar cada .input() y `getPool()` entrega
// la conexión compartida a SQL Server.
const { sql, getPool } = require("../conexion");
// `jwtMiddleware` exige token válido en las rutas de escritura y `requireAdmin`
// después deja pasar solo si el rol del token es "admin": son los dos candados
// que separan la lectura pública de la edición.
const { jwtMiddleware, requireAdmin } = require("../autenticacion");

// ── CRUD servicios ────────────────────────────────────
// GET /servicios — lista todos los servicios, ordenado por id.
// Sin token: es catálogo público y el frontend lo pide al cargar la app.
router.get("/servicios", async (req, res) => {
  try {
    const db = await getPool();
    // SELECT con las columnas explícitas (nada de SELECT *): el orden de la
    // grilla del turnero depende de ORDER BY idServicio y el precio como
    // DECIMAL viaja a JSON ya como número.
    const result = await db.request()
      .query("SELECT idServicio, nombre, precio, duracion_minutos FROM Servicio ORDER BY idServicio");
    // result.recordset es el array de filas: se manda tal cual (sin envoltorio)
    // y el frontend lo consume directo como lista.
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener servicios." });
  }
});

// POST /servicios — crea uno nuevo (solo admin).
router.post("/servicios", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  // Los tres campos son obligatorios.
  // Ojo con precio: se compara con "== null" y no con "!precio" porque un
  // precio de 0 es un valor legítimo y "!0" daría true (lo rechazaría de más).
  if (!nombre || precio == null || duracion_minutos == null) {
    return res.status(400).json({ error: "Nombre, precio y duración son obligatorios." });
  }
  try {
    const db = await getPool();
    // precio como DECIMAL(10,2) y duración como INT: los tipos los define
    // SQL Server, no el string que venga del body.
    // Los .input() mandan cada valor como parámetro (@nombre, @precio...): la
    // query nunca concatena texto del body, así que no hay inyección SQL.
    const result = await db.request()
      .input("nombre", sql.VarChar, nombre)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("duracion", sql.Int, duracion_minutos)
      .query(`
        INSERT INTO Servicio (nombre, precio, duracion_minutos)
        OUTPUT INSERTED.idServicio
        VALUES (@nombre, @precio, @duracion)
      `);
    res.status(201).json({ mensaje: "Servicio creado.", idServicio: result.recordset[0].idServicio });
  } catch (error) {
    // Único logueo del error real; al cliente le llega solo el mensaje genérico
    // para no filtrar datos internos de la base.
    console.error(error);
    res.status(500).json({ error: "Error al crear servicio." });
  }
});

// PATCH /servicios/:id — actualización parcial (solo admin).
router.patch("/servicios/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  // Si no viene NADA, no hay nada que hacer → 400 (evita un UPDATE vacío).
  if (nombre === undefined && precio === undefined && duracion_minutos === undefined) {
    return res.status(400).json({ error: "No hay campos para actualizar." });
  }
  try {
    const db = await getPool();
    // `set` acumula los fragmentos "columna = @param" que realmente llegaron;
    // `reqPatch` es UN solo request de mssql al que se le van agregando los
    // .input() a medida que se agrega el fragmento. Así se ejecuta un único
    // UPDATE parametrizado, no uno por campo.
    const set = [];
    // El id viene de la URL como texto: sql.Int + el .input() lo convierten
    // (si no fuera numérico, mssql lo pasa a NULL y el WHERE no matchea nada).
    const reqPatch = db.request().input("id", sql.Int, req.params.id);
    // Solo agrega al SET los campos que realmente llegaron.
    // nombre/precio/duracion_minutos van con tipos distintos a propósito:
    // VarChar, Decimal(10,2) e Int son los tipos reales de las columnas.
    if (nombre !== undefined) { set.push("nombre = @nombre"); reqPatch.input("nombre", sql.VarChar, nombre); }
    if (precio !== undefined) { set.push("precio = @precio"); reqPatch.input("precio", sql.Decimal(10, 2), precio); }
    if (duracion_minutos !== undefined) { set.push("duracion_minutos = @duracion"); reqPatch.input("duracion", sql.Int, duracion_minutos); }
    // El UPDATE se arma con los fragmentos ya validados: la única parte
    // dinámica son nombres de columna hardcodeados arriba (jamás texto del
    // cliente), y los valores siguen viajando como parámetros.
    await reqPatch.query(`UPDATE Servicio SET ${set.join(", ")} WHERE idServicio = @id`);
    res.json({ mensaje: "Servicio actualizado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar servicio." });
  }
});

// DELETE /servicios/:id — borrado físico (solo admin).
router.delete("/servicios/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    // Borrado físico real (DELETE), con WHERE por id: si el id no existe, la
    // query no borra nada y no falla.
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Servicio WHERE idServicio = @id");
    // rowsAffected[0] === 0 → el id no existía (404).
    // Se chequea el número de filas afectadas porque un DELETE sobre una fila
    // inexistente no lanza error: sin este chequeo respondería 200 sin haber
    // borrado nada.
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Servicio no encontrado." });
    res.json({ mensaje: "Servicio eliminado." });
  } catch (error) {
    // 547 = violación de clave foránea: el servicio tiene turnos cargados.
    // Se traduce ese código feo de SQL Server a un 409 con un mensaje que el
    // admin entiende, en vez del 500 genérico.
    if (error?.number === 547) {
      return res.status(409).json({ error: "No se puede eliminar el servicio: hay turnos cargados con él." });
    }
    console.error(error);
    res.status(500).json({ error: "Error al eliminar servicio." });
  }
});

// El router se monta en index.js sin prefijo: los paths "/servicios" de acá
// son las rutas reales de la API.
module.exports = router;