// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasClientes.js — TURNOS DE UN CLIENTE
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Un solo endpoint: GET /clientes/:idCliente/turnos
// Es el que usa la pantalla "Mis turnos" del cliente.
//
// SEGURIDAD (lo importante de este archivo):
// Requiere token (jwtMiddleware) Y además compara el idCliente del token con
// el de la URL. Si no coinciden → 403. Sin esa comparación, cualquier cliente
// logueado podría ver los turnos de OTRO cliente simplemente cambiando el
// número en la URL. Esto se llama "IDOR" y es el error de autorización más
// común en APIs.
//
// LA CONSULTA:
// JOIN con Profesional y Servicio para traer el nombre de cada uno (en vez de
// solo los ids, que el frontend no sabría mostrar). CONVERT(varchar(10), ...)
// pasa la fecha a texto 'YYYY-MM-DD' y CONVERT(varchar(5), ..., 108) pasa la
// hora a 'HH:MM' — importante por la zona horaria y por el tipo (ver el
// comentario de timezone en rutasTurnos.js: en crudo, tedious devuelve un TIME
// como objeto Date y el frontend no lo puede leer). Ordena por fecha descendente.
const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware } = require("../autenticacion");

// ── Turnos del cliente ────────────────────────────────
// GET /clientes/:idCliente/turnos — lista los turnos del cliente logueado.
router.get("/clientes/:idCliente/turnos", jwtMiddleware, async (req, res) => {
  try {
    // Autorización por propiedad: el token debe ser del MISMO cliente.
    if (Number(req.user.idCliente) !== Number(req.params.idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para ver los turnos de otro cliente." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("idCliente", sql.Int, req.params.idCliente)
      .query(`
        SELECT t.idTurno, CONVERT(varchar(10), t.fecha, 23) AS fecha, CONVERT(varchar(5), t.horaInicio, 108) AS horaInicio, t.estado, t.precioTotal, t.idProfesional,
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