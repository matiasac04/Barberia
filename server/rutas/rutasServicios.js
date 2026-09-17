const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");

// ── CRUD servicios ────────────────────────────────────
// LISTAR SERVICIOS (para el turnero)
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

// CREAR SERVICIO
router.post("/servicios", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  if (!nombre || precio == null || duracion_minutos == null) {
    return res.status(400).json({ error: "Nombre, precio y duración son obligatorios." });
  }
  try {
    const db = await getPool();
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

// ACTUALIZAR PRECIO / SERVICIO
router.patch("/servicios/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, precio, duracion_minutos } = req.body;
  if (nombre === undefined && precio === undefined && duracion_minutos === undefined) {
    return res.status(400).json({ error: "No hay campos para actualizar." });
  }
  try {
    const db = await getPool();
    const set = [];
    const reqPatch = db.request().input("id", sql.Int, req.params.id);
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

// ELIMINAR SERVICIO
router.delete("/servicios/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Servicio WHERE idServicio = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Servicio no encontrado." });
    res.json({ mensaje: "Servicio eliminado." });
  } catch (error) {
    if (error?.number === 547) {
      return res.status(409).json({ error: "No se puede eliminar el servicio: hay turnos cargados con él." });
    }
    console.error(error);
    res.status(500).json({ error: "Error al eliminar servicio." });
  }
});

module.exports = router;