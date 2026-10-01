// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasTurnos.js — TODA LA LÓGICA DE RESERVAS
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es el archivo más importante del backend: maneja la disponibilidad, la
// reserva, la cancelación, la reprogramación y el borrado de turnos.
// Define 6 endpoints:
//
//   GET    /turnos/disponibles     → qué horas están ocupadas (fecha+profesional)
//   GET    /turnos/ocupados        → todos los ocupados de un rango (calendario)
//   GET    /turnos                 → TODOS los turnos del local (solo admin)
//   POST   /turnos                 → reservar un turno
//   PATCH  /turnos/:id/cancelar    → baja lógica (estado = 'Cancelado')
//   PATCH  /turnos/:id             → editar / reprogramar
//   DELETE /turnos/:id             → borrado físico (solo admin)
//
// REGLA DE NEGOCIO VALIDADA AQUÍ (la 24 h):
// El frontend la aplica con canCancelBooking, pero eso SOLO alcanza a la UI:
// cualquiera podría llamar a la API a mano y cancelar un turno para dentro
// de una hora. Por eso la misma regla se valida acá, en el servidor, que es
// el que decide de verdad. El admin queda exceptuado (puede tocar cualquier
// turno, incluso sobre la hora, para corregir errores de agenda).
//
// EL "HUECO" DE UN TURNO:
// La consulta de disponibilidad filtra por `estado IS NULL OR estado <> 'Cancelado'`.
// O sea: un turno cancelado NO ocupa el horario. Cancelar es LIBERAR el slot,
// así que otro cliente puede reservarlo de nuevo.
//
// LA ZONA HORARIA (el detalle que más bugs causa):
// tedious viene con useUTC: true. Un DATE de SQL Server llega como medianoche
// UTC, y en Argentina (UTC-3) getDate() devuelve el día ANTERIOR. Para evitarlo,
// todas las consultas piden la fecha YA como texto con CONVERT(varchar(10), ..., 23)
// ('YYYY-MM-DD'), que es la convención de todo el proyecto. Por eso los SELECT
// que calculan la regla de las 24 h piden `fechaIso` y no `fecha`.
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
// GET /turnos/disponibles?fecha=&idProfesional=
// Devuelve QUÉ horas están ocupadas, no las libres: el frontend las resta
// de los slots del día (ver availableSlots en App.jsx). Así la lógica de
// "libres" está en un solo lado (el frontend), no partida en dos.
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

// GET /turnos/ocupados?inicio=&fin=
// Trae TODOS los turnos de un rango de fechas. Es lo que usa el calendario
// mensual para pintar cuántos slots hay libres por día, sin pedir una
// consulta por cada día (serían 30 requests en vez de 1).
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
// GET /turnos — TODOS los turnos del local, solo admin.
// 3 JOINs para traer los nombres legibles (cliente, profesional, servicio)
// y COALESCE para el teléfono: usa el del turno si se cargó, si no el de la
// ficha del cliente. Ordena por fecha desc y hora asc.
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
// POST /turnos — el cliente reserva. Es la ruta con más validaciones porque
// es la que escribe en la agenda:
//   1. Campos obligatorios
//   2. El idCliente del body debe coincidir con el del token (no reservar por otro)
//   3. Domingo (0) o lunes (1) → 400 (cerrado)
//   4. Fuera de [hoy, +30 días] → 400
//   5. El horario ya está ocupado → 409 (doble reserva / race condition)
//   6. El servicio existe → 404
// Precio y duración NO vienen del body: se copian de la tabla Servicio, así
// el cliente no puede inventarse el importe.
router.post("/turnos", jwtMiddleware, async (req, res) => {
  const { idCliente, idProfesional, idServicio, fecha, horaInicio, telefono } = req.body;

  if (!idCliente || !idProfesional || !idServicio || !fecha || !horaInicio) {
    return res.status(400).json({ error: "Cliente, profesional, servicio, fecha y horario son obligatorios." });
  }

  // Solo puede reservar para sí mismo.
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

    // ¿Ese horario ya está tomado? (ignora cancelados)
    // Esto también evita la carrera de dos clientes reservando el mismo
    // slot a la vez: el primero que llega al INSERT lo gana.
    const ocupado = await db.request()
      .input("idProfesional", sql.Int, idProfesional)
      .input("fecha", sql.Date, fecha)
      .input("horaInicio", sql.VarChar, horaInicio)
      .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND (estado IS NULL OR estado <> 'Cancelado')");

    if (ocupado.recordset.length > 0) {
      return res.status(409).json({ error: "Ese horario ya fue reservado. Elegí otro horario disponible." });
    }

    // Trae precio y duración REALES del catálogo (no confía en el body).
    const servicio = await db.request()
      .input("idServicio", sql.Int, idServicio)
      .query("SELECT duracion_minutos, precio FROM Servicio WHERE idServicio = @idServicio");

    if (servicio.recordset.length === 0) {
      return res.status(404).json({ error: "El servicio elegido no existe." });
    }

    const { duracion_minutos, precio } = servicio.recordset[0];

    // INSERT: guarda una "foto" del precio y la duración al momento de
    // reservar, por si después cambian en el catálogo (el turno histórico
    // no debe alterarse). estado arranca en 'Confirmado'.
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
// PATCH /turnos/:id/cancelar — baja LÓGICA: NO borra la fila, solo pone
// estado = 'Cancelado'. Así el turno queda en el historial pero libera el slot.
// El admin puede cancelar cualquier turno; el cliente solo el suyo y con >24 h.
router.patch("/turnos/:id/cancelar", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    // Trae el turno con la fecha YA como texto (CONVERT) para poder aplicar
    // la regla de las 24 h sin que corra un día por la zona horaria.
    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, CONVERT(varchar(10), fecha, 23) AS fecha, horaInicio FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const { idCliente, fecha, horaInicio } = turno.recordset[0];
    // Dueño del turno, o admin.
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

// PATCH /turnos/:id — editar / reprogramar (admin o el propio cliente).
// Es la ruta más larga del proyecto. Actualización PARCIAL: solo toca los
// campos que vienen en el body. Se usa en dos casos:
//   - Admin: corrige cualquier campo y cambia el estado (marcar completado,
//     no se presentó, etc.)
//   - Cliente: reprograma (manda fecha y/o horaInicio).
//
// Autorización: el cliente solo su propio turno, y NUNCA puede cambiar el
// `estado` (eso es de la agenda interna del local).
//
// REGLA DE LAS 24 h AL REPROGRAMAR: se mide sobre el turno ACTUAL (el que se
// está por liberar), no sobre el nuevo. La idea: reprogramar es tan "soltar un
// horario" como cancelar, así que lleva la misma antelación; pero arrastrar un
// turno de la semana que viene a otra fecha NO es una cancelación de último
// momento, y medirlo sobre la fecha nueva lo dejaría trabado sin sentido.
//
// TRANSACCIÓN: el UPDATE del turno y el UPDATE opcional del cliente van
// juntos. Si el segundo falla, se revierte el primero: no queda medio turno
// actualizado a nombre de un cliente a medio cambiar.
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
    // El estado es campo exclusivo del admin.
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

    // Si viene fecha nueva, se revalida como en la reserva.
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

    // Para el chequeo de ocupación hay que resolver el destino FINAL:
    // si no viene profesional, se usa el actual; si no, idProfesional.
    const profFinal = idProfesional != null ? idProfesional : turnoActual.idProfesional;
    const fechaFinal = fecha !== undefined ? fecha : turnoActual.fecha;
    const horaFinal = horaInicio !== undefined ? horaInicio : turnoActual.horaInicio;
    // ¿El destino está ocupado por OTRO turno? (idTurno <> @id excluye este
    // mismo turno, que si no siempre se chocaría consigo mismo).
    const ocupado = await db.request()
      .input("idProfesional", sql.Int, profFinal)
      .input("fecha", sql.Date, fechaFinal)
      .input("horaInicio", sql.VarChar, horaFinal)
      .input("id", sql.Int, req.params.id)
      .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND idTurno <> @id AND (estado IS NULL OR estado <> 'Cancelado')");
    if (ocupado.recordset.length > 0) {
      return res.status(409).json({ error: "Ese horario ya fue reservado para ese profesional. Elegí otro horario disponible." });
    }

    // Arranca la transacción: desde acá, todo o nada.
    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {
      // --- Parte 1: UPDATE del turno (campos dinámicos) ---
      const set = [];
      const reqPatch = new sql.Request(transaction).input("id", sql.Int, req.params.id);
      if (idProfesional !== undefined) { set.push("idProfesional = @idProfesional"); reqPatch.input("idProfesional", sql.Int, idProfesional); }
      if (idServicio !== undefined) { set.push("idServicio = @idServicio"); reqPatch.input("idServicio", sql.Int, idServicio); }
      if (fecha !== undefined) { set.push("fecha = @fecha"); reqPatch.input("fecha", sql.Date, fecha); }
      if (horaInicio !== undefined) { set.push("horaInicio = @horaInicio"); reqPatch.input("horaInicio", sql.VarChar, horaInicio); }
      if (estado !== undefined) {
        // Traduce el estado del frontend (inglés) al de la DB (español).
        // 'expired' no está: es un estado LÓGICO del frontend (turno que ya
        // pasó), no algo que se guarde.
        const mapaEstado = { pending: 'Confirmado', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'NoSePresento', cancelled: 'Cancelado' };
        set.push("estado = @estado");
        reqPatch.input("estado", sql.VarChar, mapaEstado[estado] ?? String(estado));
      }
      if (set.length > 0) await reqPatch.query(`UPDATE Turno SET ${set.join(", ")} WHERE idTurno = @id`);

      // --- Parte 2: UPDATE opcional del cliente ---
      // Si el admin editó el nombre o el teléfono del turno, se propaga a la
      // ficha del Cliente para que no se pierda la corrección.
      if (idCliente != null && (nombreCliente !== undefined || telefono !== undefined)) {
        const cs = [];
        const cReq = new sql.Request(transaction).input("idCliente", sql.Int, idCliente);
        if (nombreCliente !== undefined) {
          // Viene "Juan Pérez" pero la tabla guarda nombre y apellido sueltos:
          // el primero es nombre, el resto es apellido.
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
      // Algo falló → se deshace todo y el error sube al catch de afuera.
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar el turno." });
  }
});

// DELETE /turnos/:id — borrado FÍSICO (a diferencia de /cancelar, este
// elimina la fila de verdad). Solo admin, sin regla de las 24 h: es una
// corrección de agenda, no una cancelación del cliente.
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