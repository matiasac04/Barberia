const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");

// ── Regla de negocio: 24 h de antelación ─────────────
// El frontend la aplica con canCancelBooking (src/utilidades/ayudantes.js),
// pero eso alcanza SOLO a la UI: cualquiera podría llamar a la API a mano y
// cancelar o reprogramar un turno para dentro de una hora. Por eso la misma
// regla se valida acá, en el servidor, que es el que decide de verdad.
const MS_24H = 24 * 60 * 60 * 1000;

// Arma el Date real del turno a partir de una fecha 'YYYY-MM-DD' y una hora
// 'HH:MM' / 'HH:MM:SS'.
//
// OJO con el formato de la fecha: tiene que ser SIEMPRE el string que devuelve
// CONVERT(varchar(10), fecha, 23), nunca el Date crudo de la columna DATE.
// tedious viene con useUTC: true, o sea que un DATE llega como medianoche UTC
// y en Argentina (UTC-3) getDate() te devuelve el día ANTERIOR: la regla de las
// 24 h quedaría corrida un día entero. Por eso las consultas de abajo piden
// fecha y hora ya como texto, que es la convención que usa todo el resto del
// proyecto (ver CONVERT en /turnos y /turnos/ocupados).
const inicioDeTurno = (fechaIso, horaInicio) => {
  const f = new Date(`${String(fechaIso ?? '').trim()}T00:00:00`);
  if (Number.isNaN(f.getTime())) return null;
  const [h, m] = String(horaInicio ?? "00:00").slice(0, 5).split(":").map(Number);
  const inicio = new Date(f.getFullYear(), f.getMonth(), f.getDate(), h || 0, m || 0, 0, 0);
  return Number.isNaN(inicio.getTime()) ? null : inicio;
};

// ¿Al turno le quedan menos de 24 h? Si la fecha/hora viniera corrupta no
// bloqueamos nada (que el resto de las validaciones hablen).
const tieneMenosDe24h = (fechaIso, horaInicio) => {
  const inicio = inicioDeTurno(fechaIso, horaInicio);
  if (!inicio) return false;
  return inicio.getTime() - Date.now() < MS_24H;
};

// ── Disponibilidad (turnos libres/ocupados) ───────────
// VER TURNOS DISPONIBLES
router.get("/turnos/disponibles", jwtMiddleware, async (req, res) => {
  const { fecha, idProfesional } = req.query;
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("fecha", sql.Date, fecha)
      .query("SELECT horaInicio, horaFin FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND (estado IS NULL OR estado <> 'Cancelado')");
    res.json({ fecha, idProfesional, turnosOcupados: ocupados.recordset });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar disponibilidad." });
  }
});

// VER TURNOS OCUPADOS EN UN RANGO (para el turnero: contar libres por día)
router.get("/turnos/ocupados", jwtMiddleware, async (req, res) => {
  const { inicio, fin } = req.query;
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("inicio", sql.Date, inicio)
      .input("fin", sql.Date, fin)
      .query("SELECT idProfesional, CONVERT(varchar(10), fecha, 23) AS fecha, horaInicio FROM Turno WHERE fecha BETWEEN @inicio AND @fin AND (estado IS NULL OR estado <> 'Cancelado')");
    res.json(ocupados.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al consultar turnos ocupados." });
  }
});

// ── Listar turnos (admin) ─────────────────────────────
// LISTAR TODOS LOS TURNOS (ADMIN)
router.get("/turnos", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT t.idTurno, t.idCliente, t.idProfesional, t.idServicio, CONVERT(varchar(10), t.fecha, 23) AS fecha, t.horaInicio, t.estado, t.precioTotal,
               c.nombre + ' ' + c.apellido AS nombreCliente, c.email, COALESCE(t.telefono, c.telefono) AS telefono,
               p.nombre + ' ' + p.apellido AS profesional,
               s.nombre AS servicio
        FROM Turno t
        JOIN Cliente c ON t.idCliente = c.idCliente
        JOIN Profesional p ON t.idProfesional = p.idProfesional
        JOIN Servicio s ON t.idServicio = s.idServicio
        ORDER BY t.fecha DESC, t.horaInicio ASC
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener turnos." });
  }
});

// ── Reservar turno ────────────────────────────────────
// RESERVAR TURNO
router.post("/turnos", jwtMiddleware, async (req, res) => {
  const { idCliente, idProfesional, idServicio, fecha, horaInicio, telefono } = req.body;

  if (!idCliente || !idProfesional || !idServicio || !fecha || !horaInicio) {
    return res.status(400).json({ error: "Cliente, profesional, servicio, fecha y horario son obligatorios." });
  }

  if (Number(req.user.idCliente) !== Number(idCliente)) {
    return res.status(403).json({ error: "No podés reservar un turno a nombre de otro cliente." });
  }

  const fechaObj = new Date(`${fecha}T00:00:00`);
  const diaNum = fechaObj.getDay();
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio); hoyFin.setDate(hoyFin.getDate() + 30); hoyFin.setHours(23, 59, 59, 999);
  if (diaNum === 0 || diaNum === 1) {
    return res.status(400).json({ error: "No se pueden pedir turnos los domingos ni los lunes (cerrado)." });
  }
  if (Number.isNaN(fechaObj.getTime()) || fechaObj < hoyInicio || fechaObj > hoyFin) {
    return res.status(400).json({ error: "Solo se pueden pedir turnos desde hoy hasta dentro de un mes." });
  }

  try {
    const db = await getPool();

    const ocupado = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("fecha", sql.Date, fecha)
      .input("horaInicio", sql.VarChar, horaInicio)
      .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND (estado IS NULL OR estado <> 'Cancelado')");

    if (ocupado.recordset.length > 0) {
      return res.status(409).json({ error: "Ese horario ya fue reservado. Elegí otro horario disponible." });
    }

    const servicio = await db.request()
      .input("idServicio", sql.Int, idServicio)
      .query("SELECT duracion_minutos, precio FROM Servicio WHERE idServicio = @idServicio");

    if (servicio.recordset.length === 0) {
      return res.status(404).json({ error: "El servicio elegido no existe." });
    }

    const { duracion_minutos, precio } = servicio.recordset[0];

    const result = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("idCliente", sql.Int, idCliente)
      .input("idServicio", sql.Int, idServicio)
      .input("fecha", sql.Date, fecha)
      .input("horaInicio", sql.VarChar, horaInicio)
      .input("duracion", sql.Int, duracion_minutos)
      .input("precio", sql.Decimal(10, 2), precio)
      .input("telefono", sql.VarChar, telefono || null)
      .input("estado", sql.VarChar, 'Confirmado')
      .query(`
        INSERT INTO Turno (idProfesional, idCliente, idServicio, fecha, horaInicio, duracionReal, precioTotal, telefono, estado)
        OUTPUT INSERTED.idTurno
        VALUES (@idProfesional, @idCliente, @idServicio, @fecha, @horaInicio, @duracion, @precio, @telefono, @estado)
      `);

    res.status(201).json({ mensaje: "Turno reservado.", idTurno: result.recordset[0].idTurno });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al reservar turno." });
  }
});

// ── Cancelar, editar y eliminar turnos ────────────────
// CANCELAR TURNO
router.patch("/turnos/:id/cancelar", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, CONVERT(varchar(10), fecha, 23) AS fecha, horaInicio FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const { idCliente, fecha, horaInicio } = turno.recordset[0];
    if (req.user.role !== 'admin' && Number(req.user.idCliente) !== Number(idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para cancelar este turno." });
    }
    // Solo al cliente lo traba la antelación: el admin puede tocar cualquier
    // turno incluso sobre la hora (para corregir errores de agenda).
    if (req.user.role !== 'admin' && tieneMenosDe24h(fecha, horaInicio)) {
      return res.status(400).json({ error: "No se puede cancelar con menos de 24 horas de antelación. Contactanos al local." });
    }
    await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Turno SET estado = 'Cancelado' WHERE idTurno = @id");
    res.json({ mensaje: "Turno cancelado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al cancelar turno." });
  }
});

// EDITAR TURNO (admin): actualiza Turno y, si llegan, los datos del cliente
router.patch("/turnos/:id", jwtMiddleware, async (req, res) => {
  const { idProfesional, idServicio, fecha, horaInicio, estado, nombreCliente, telefono } = req.body;
  try {
    const db = await getPool();
    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, idProfesional, fecha, horaInicio, CONVERT(varchar(10), fecha, 23) AS fechaIso FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const turnoActual = turno.recordset[0];
    const idCliente = turnoActual.idCliente;
    if (req.user.role !== 'admin' && Number(req.user.idCliente) !== Number(idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para editar este turno." });
    }
    if (estado !== undefined && req.user.role !== 'admin') {
      return res.status(403).json({ error: "Solo el administrador puede cambiar el estado de un turno." });
    }
    // Reprogramar es tan "liberar el horario" como cancelar, así que lleva la
    // misma antelación de 24 h. Se mide sobre el turno ACTUAL (el que se está
    // por liberar), no sobre el nuevo: arrastrar un turno de la semana que
    // viene a otra fecha no es una cancelación de último momento.
    if (req.user.role !== 'admin' && (fecha !== undefined || horaInicio !== undefined) && tieneMenosDe24h(turnoActual.fechaIso, turnoActual.horaInicio)) {
      return res.status(400).json({ error: "No se puede reprogramar con menos de 24 horas de antelación. Contactanos al local." });
    }

    if (fecha !== undefined) {
      const fechaObj = new Date(`${fecha}T00:00:00`);
      const diaNum = fechaObj.getDay();
      const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
      const hoyFin = new Date(hoyInicio); hoyFin.setDate(hoyFin.getDate() + 30); hoyFin.setHours(23, 59, 59, 999);
      if (Number.isNaN(fechaObj.getTime()) || diaNum === 0 || diaNum === 1) {
        return res.status(400).json({ error: "La fecha elegida es domingo o lunes: la barbería está cerrada." });
      }
      if (fechaObj < hoyInicio || fechaObj > hoyFin) {
        return res.status(400).json({ error: "Solo se pueden pedir turnos desde hoy hasta dentro de un mes." });
      }
    }

    const profFinal = idProfesional != null ? idProfesional : turnoActual.idProfesional;
    const fechaFinal = fecha !== undefined ? fecha : turnoActual.fecha;
    const horaFinal = horaInicio !== undefined ? horaInicio : turnoActual.horaInicio;
    const ocupado = await db.request()
      .input("idProfesional", sql.Int, profFinal)
      .input("fecha", sql.Date, fechaFinal)
      .input("horaInicio", sql.VarChar, horaFinal)
      .input("id", sql.Int, req.params.id)
      .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND idTurno <> @id AND (estado IS NULL OR estado <> 'Cancelado')");
    if (ocupado.recordset.length > 0) {
      return res.status(409).json({ error: "Ese horario ya fue reservado para ese profesional. Elegí otro horario disponible." });
    }

    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {
      const set = [];
      const reqPatch = new sql.Request(transaction).input("id", sql.Int, req.params.id);
      if (idProfesional !== undefined) { set.push("idProfesional = @idProfesional"); reqPatch.input("idProfesional", sql.Int, idProfesional); }
      if (idServicio !== undefined) { set.push("idServicio = @idServicio"); reqPatch.input("idServicio", sql.Int, idServicio); }
      if (fecha !== undefined) { set.push("fecha = @fecha"); reqPatch.input("fecha", sql.Date, fecha); }
      if (horaInicio !== undefined) { set.push("horaInicio = @horaInicio"); reqPatch.input("horaInicio", sql.VarChar, horaInicio); }
      if (estado !== undefined) {
        const mapaEstado = { pending: 'Confirmado', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'NoSePresento', cancelled: 'Cancelado' };
        set.push("estado = @estado");
        reqPatch.input("estado", sql.VarChar, mapaEstado[estado] ?? String(estado));
      }
      if (set.length > 0) await reqPatch.query(`UPDATE Turno SET ${set.join(", ")} WHERE idTurno = @id`);

      if (idCliente != null && (nombreCliente !== undefined || telefono !== undefined)) {
        const cs = [];
        const cReq = new sql.Request(transaction).input("idCliente", sql.Int, idCliente);
        if (nombreCliente !== undefined) {
          const partes = String(nombreCliente).trim().split(/\s+/);
          cs.push("nombre = @nombre", "apellido = @apellido");
          cReq.input("nombre", sql.VarChar, partes[0] ?? '');
          cReq.input("apellido", sql.VarChar, partes.slice(1).join(' ') || '');
        }
        if (telefono !== undefined) { cs.push("telefono = @telefono"); cReq.input("telefono", sql.VarChar, telefono || null); }
        if (cs.length > 0) await cReq.query(`UPDATE Cliente SET ${cs.join(", ")} WHERE idCliente = @idCliente`);
      }

      await transaction.commit();
      res.json({ mensaje: "Turno actualizado." });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el turno." });
  }
});

// ELIMINAR TURNO (admin)
router.delete("/turnos/:id", jwtMiddleware, async (req, res) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: "Solo el administrador puede eliminar turnos." });
    }
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("DELETE FROM Turno WHERE idTurno = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Turno no encontrado." });
    res.json({ mensaje: "Turno eliminado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al eliminar el turno." });
  }
});

module.exports = router;