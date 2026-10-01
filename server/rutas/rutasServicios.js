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
const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");

// ── CRUD servicios ────────────────────────────────────
// GET /servicios — lista todos los servicios, ordenado por id.
// Sin token: es catálogo público y el frontend lo pide al cargar la app.
router.get("/servicios", async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query("SELECT idServicio, nombre, precio, duracion_minutos FROM Servicio ORDER BY idServicio");
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
  if (!nombre || precio == null || duracion_minutos == null) {
    return res.status(400).json({ error: "Nombre, precio y duración son obligatorios." });
  }
  try {
    const db = await getPool();
    // precio como DECIMAL(10,2) y duración como INT: los tipos los define
    // SQL Server, no el string que venga del body.
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
    const set = [];
    const reqPatch = db.request().input("id", sql.Int, req.params.id);
    // Solo agrega al SET los campos que realmente llegaron.
    if (nombre !== undefined) { set.push("nombre = @nombre"); reqPatch.input("nombre", sql.VarChar, nombre); }
    if (precio !== undefined) { set.push("precio = @precio"); reqPatch.input("precio", sql.Decimal(10, 2), precio); }
    if (duracion_minutos !== undefined) { set.push("duracion_minutos = @duracion"); reqPatch.input("duracion", sql.Int, duracion_minutos); }
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
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Servicio WHERE idServicio = @id");
    // rowsAffected[0] === 0 → el id no existía (404).
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Servicio no encontrado." });
    res.json({ mensaje: "Servicio eliminado." });
  } catch (error) {
    // 547 = violación de clave foránea: el servicio tiene turnos cargados.
    if (error?.number === 547) {
      return res.status(409).json({ error: "No se puede eliminar el servicio: hay turnos cargados con él." });
    }
    console.error(error);
    res.status(500).json({ error: "Error al eliminar servicio." });
  }
});

module.exports = router;