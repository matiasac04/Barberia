const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware } = require("../autenticacion");

// ── Turnos del cliente ────────────────────────────────
// VER MIS TURNOS
router.get("/clientes/:idCliente/turnos", jwtMiddleware, async (req, res) => {
  try {
    if (Number(req.user.idCliente) !== Number(req.params.idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para ver los turnos de otro cliente." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("idCliente", sql.Int, req.params.idCliente)
      .query(`
        SELECT t.idTurno, CONVERT(varchar(10), t.fecha, 23) AS fecha, t.horaInicio, t.estado, t.precioTotal, t.idProfesional,
               p.nombre + ' ' + p.apellido AS profesional,
               s.nombre AS servicio
        FROM Turno t
        JOIN Profesional p ON t.idProfesional = p.idProfesional
        JOIN Servicio s ON t.idServicio = s.idServicio
        WHERE t.idCliente = @idCliente
        ORDER BY t.fecha DESC
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener turnos." });
  }
});

module.exports = router;