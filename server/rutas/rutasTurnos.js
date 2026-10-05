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
//
// LAS HORAS (TIME) TIENEN EL MISMO PROBLEMA, Y MÁS GRAVE:
// tedious devuelve una columna TIME como un objeto Date de 1970-01-01, NO como
// texto (ver tedious/lib/data-types/time.js). Del lado del frontend eso rompía
// en silencio: `normalizarHoraApi` hacía String(fecha).slice(0,8) sobre
// "Mon Jan 01 1970 09:30:00 GMT-0300…" y devolvía ''. Como el código hace
// `.filter(Boolean)`, la lista de horas ocupadas quedaba VACÍA sin dar ningún
// error: el calendario pintaba todos los días "libre" y el cliente no podía
// cancelar ni reprogramar (canCancelBooking necesita la hora). Por eso TODA
// consulta que devuelve una hora la convierte con CONVERT(varchar(5), ..., 108)
// → 'HH:MM'. Si agregás un SELECT que devuelva horaInicio u horaFin, hacelo
// con CONVERT también.
const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");
const { errorFecha, errorId } = require("../validaciones");

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

// ── Normalización y slots atendibles ──────────────────
// normalizarHora(valor): deja cualquier hora en 'HH:MM' o devuelve '' si no es
// una hora válida. La usan las validaciones y el INSERT, para que en la base
// quede siempre el mismo formato y las comparaciones de ocupación no dependan
// de si el cliente mandó '9:00', '09:00' o '09:00:00'.
const normalizarHora = (valor) => {
  const p = String(valor ?? '').trim().slice(0, 5).split(':').map(Number);
  if (p.length < 2 || !Number.isFinite(p[0]) || !Number.isFinite(p[1])) return '';
  if (p[0] < 0 || p[0] > 23 || p[1] < 0 || p[1] > 59) return '';
  return `${String(p[0]).padStart(2, '0')}:${String(p[1]).padStart(2, '0')}`;
};

// SLOTS_POR_DIA: cada turno dura 30 minutos (el paso entre horarios).
const SLOTS_POR_DIA = 30;
// SLOTS_FALLBACK: horarios de respaldo para un profesional SIN horario laboral
// cargado. Son los mismos 12 que usa el frontend (src/datos/semilla.js) y están
// duplicados acá a propósito: el servidor NO puede importar el módulo del
// frontend, y si validara contra un horario vacío dejaría de poderse reservar
// con todo profesional que el admin todavía no configuró (el turnero sí le
// mostraría esos slots → la UI y la API quedarían desincronizadas).
const SLOTS_FALLBACK = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '15:00', '15:30', '16:00', '16:30', '17:00'];

// aMinutos('09:30') -> 570 (minutos desde las 00:00).
const aMinutos = (hora) => {
  const p = String(hora ?? '').slice(0, 5).split(':').map(Number);
  return (Number(p[0]) || 0) * 60 + (Number(p[1]) || 0);
};
// desdeMinutos(570) -> '09:30'. Siempre con 2 dígitos.
const desdeMinutos = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;

// slotsAtendiblesDelDia(db, idProfesional, diaSemana): los horarios que el
// profesional realmente atiende ese día.
//   - Si tiene filas en HorarioLaboral → genera los slots de 30' de cada bloque.
//   - Si NO tiene ninguna → devuelve SLOTS_FALLBACK (mismo criterio que
//     getWeeklySlots del frontend).
// OJO: horaEntrada/horaSalida vienen CONVERTidas a varchar, porque en crudo son
// objetos Date de tedious (ver la nota de TIME en la cabecera).
const slotsAtendiblesDelDia = async (db, idProfesional, diaSemana) => {
  const rows = await db.request()
    .input("idProfesional", sql.Int, idProfesional)
    .input("diaSemana", sql.Int, diaSemana)
    .query(`
      SELECT CONVERT(varchar(5), horaEntrada, 108) AS horaEntrada,
             CONVERT(varchar(5), horaSalida, 108) AS horaSalida
      FROM HorarioLaboral
      WHERE idProfesional = @idProfesional AND diaSemana = @diaSemana
        AND horaEntrada IS NOT NULL AND horaSalida IS NOT NULL
    `);
  if (rows.recordset.length === 0) return SLOTS_FALLBACK;
  const slots = new Set();
  for (const r of rows.recordset) {
    const desde = aMinutos(r.horaEntrada), hasta = aMinutos(r.horaSalida);
    if (hasta < desde) continue;
    for (let m = desde; m <= hasta; m += SLOTS_POR_DIA) slots.add(desdeMinutos(m));
  }
  return [...slots].sort();
};

// estaBloqueado(db, idProfesional, fecha, hora): ¿el admin marcó ese horario
// (o el día entero, que se guarda con hora = NULL) como no disponible?
const estaBloqueado = async (db, idProfesional, fecha, hora) => {
  const r = await db.request()
    .input("idProfesional", sql.Int, idProfesional)
    .input("fecha", sql.Date, fecha)
    .input("hora", sql.VarChar, hora)
    .query("SELECT idBloqueo FROM BloqueoHorario WHERE idProfesional = @idProfesional AND fecha = @fecha AND (hora IS NULL OR hora = @hora)");
  return r.recordset.length > 0;
};

// ── Disponibilidad (turnos libres/ocupados) ───────────
// GET /turnos/disponibles?fecha=&idProfesional=
// Devuelve QUÉ horas están ocupadas, no las libres: el frontend las resta
// de los slots del día (ver availableSlots en App.jsx). Así la lógica de
// "libres" está en un solo lado (el frontend), no partida en dos.
router.get("/turnos/disponibles", jwtMiddleware, async (req, res) => {
  const { fecha, idProfesional } = req.query;
  // Se validan ANTES de tocar la base. Antes no se chequeaba nada: con
  // fecha="no-es-fecha", "2026-13-45" o fecha="" el driver pasaba el string a
  // un DATE de SQL, la comparación con una columna DATE no matcheaba y la query
  // reventaba → la API respondía 500 "Error al consultar disponibilidad".
  // Verificado: los tres casos devolvían 500.
  const errFecha = errorFecha(fecha);
  if (errFecha) return res.status(400).json({ error: errFecha });
  const errId = errorId(idProfesional);
  if (errId) return res.status(400).json({ error: errId });
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("idProfesional", sql.Int, Number(idProfesional))
      .input("fecha", sql.Date, fecha)
      .query("SELECT CONVERT(varchar(5), horaInicio, 108) AS horaInicio, CONVERT(varchar(5), horaFin, 108) AS horaFin FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND (estado IS NULL OR estado <> 'Cancelado')");
    res.json({ fecha, idProfesional: Number(idProfesional), turnosOcupados: ocupados.recordset });
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
  // Misma validación que en /turnos/disponibles, por el mismo motivo.
  const errInicio = errorFecha(inicio);
  if (errInicio) return res.status(400).json({ error: `Parámetro "inicio": ${errInicio}` });
  const errFin = errorFecha(fin);
  if (errFin) return res.status(400).json({ error: `Parámetro "fin": ${errFin}` });
  // Un rango al revés traería 0 filas y la app dibujaría el mes entero como
  // libre, que es peor que un error: el cliente elige un slot ya tomado.
  if (inicio > fin) {
    return res.status(400).json({ error: 'El rango de fechas está invertido: "inicio" tiene que ser anterior a "fin".' });
  }
  // Y un rango acotado. Sin esto, un cliente puede pedir del año 1900 al 2999 y
  // dumpingar la agenda histórica entera en una sola respuesta.
  const dias = (new Date(`${fin}T00:00:00`) - new Date(`${inicio}T00:00:00`)) / 86400000;
  if (dias > 93) {
    return res.status(400).json({ error: "El rango es demasiado grande (máximo 3 meses)." });
  }
  try {
    const db = await getPool();
    const ocupados = await db.request()
      .input("inicio", sql.Date, inicio)
      .input("fin", sql.Date, fin)
      .query("SELECT idProfesional, CONVERT(varchar(10), fecha, 23) AS fecha, CONVERT(varchar(5), horaInicio, 108) AS horaInicio FROM Turno WHERE fecha BETWEEN @inicio AND @fin AND (estado IS NULL OR estado <> 'Cancelado')");
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
        SELECT t.idTurno, t.idCliente, t.idProfesional, t.idServicio, CONVERT(varchar(10), t.fecha, 23) AS fecha, CONVERT(varchar(5), t.horaInicio, 108) AS horaInicio, t.estado, t.precioTotal,
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
//   1. Campos obligatorios + hora en formato 'HH:MM'
//   2. El idCliente del body debe coincidir con el del token (no reservar por otro)
//   3. Domingo (0) o lunes (1) → 400 (cerrado)
//   4. Fuera de [hoy, +30 días] → 400
//   5. El profesional existe y está ACTIVO → 404 / 400
//   6. La hora está dentro de su horario laboral → 400
//   7. El admin no bloqueó ese horario (ni el día entero) → 409
//   8. El servicio existe → 404
//   9. El horario ya está ocupado → 409 (doble reserva / race condition)
// Precio y duración NO vienen del body: se copian de la tabla Servicio, así
// el cliente no puede inventarse el importe.
//
// POR QUÉ LAS VALIDACIONES 5, 6 Y 7 ESTÁN ACÁ Y NO SOLO EN EL FRONTEND:
// el turnero ya esconde los slots bloqueados y los que están fuera de horario,
// pero eso es solo UI: cualquiera puede llamar a la API a mano y meter un turno
// en un horario que el admin bloqueó, fuera del horario del profesional, o con
// un profesional dado de baja. La regla se tiene que cumplir en el servidor.
router.post("/turnos", jwtMiddleware, async (req, res) => {
  const { idCliente, idProfesional, idServicio, fecha, horaInicio, telefono } = req.body;

  if (!idCliente || !idProfesional || !idServicio || !fecha || !horaInicio) {
    return res.status(400).json({ error: "Cliente, profesional, servicio, fecha y horario son obligatorios." });
  }

  // La hora se normaliza una sola vez y se usa para TODO lo de abajo (validar
  // horario, chequear bloqueo, insertar): así no puede colarse un '9:0' que
  // en la base quedaría distinto de los slots que compara la disponibilidad.
  const hora = normalizarHora(horaInicio);
  if (!hora) {
    return res.status(400).json({ error: "El horario no tiene un formato válido (se espera HH:MM)." });
  }

  // Solo puede reservar para sí mismo.
  if (Number(req.user.idCliente) !== Number(idCliente)) {
    return res.status(403).json({ error: "No podés reservar un turno a nombre de otro cliente." });
  }

  // Se valida la fecha ANTES de sacar el día de la semana: getDay() de una fecha
  // inválida devuelve NaN y las comparaciones de abajo no fallarían solas.
  const fechaObj = new Date(`${fecha}T00:00:00`);
  if (Number.isNaN(fechaObj.getTime())) {
    return res.status(400).json({ error: "La fecha indicada no es válida." });
  }
  const diaNum = fechaObj.getDay();
  const hoyInicio = new Date(); hoyInicio.setHours(0, 0, 0, 0);
  const hoyFin = new Date(hoyInicio); hoyFin.setDate(hoyFin.getDate() + 30); hoyFin.setHours(23, 59, 59, 999);
  if (diaNum === 0 || diaNum === 1) {
    return res.status(400).json({ error: "No se pueden pedir turnos los domingos ni los lunes (cerrado)." });
  }
  if (fechaObj < hoyInicio || fechaObj > hoyFin) {
    return res.status(400).json({ error: "Solo se pueden pedir turnos desde hoy hasta dentro de un mes." });
  }

  try {
    const db = await getPool();

    // El servicio tiene que existir (trae precio y duración REALES del
    // catálogo, no confía en el body). Va primero que las validaciones del
    // profesional para no hacer trabajo inútil con un servicio inexistente.
    const servicio = await db.request()
      .input("idServicio", sql.Int, idServicio)
      .query("SELECT duracion_minutos, precio FROM Servicio WHERE idServicio = @idServicio");

    if (servicio.recordset.length === 0) {
      return res.status(404).json({ error: "El servicio elegido no existe." });
    }
    const { duracion_minutos, precio } = servicio.recordset[0];

    // El profesional tiene que existir y estar ACTIVO. La baja de un
    // profesional es lógica (activo = 0), así que la fila sigue ahí: sin este
    // check, un POST con el id de alguien dado de baja reservaría con un
    // profesional que ya no atiende.
    const profesional = await db.request()
      .input("id", sql.Int, idProfesional)
      .query("SELECT activo FROM Profesional WHERE idProfesional = @id");
    if (profesional.recordset.length === 0) {
      return res.status(404).json({ error: "El profesional elegido no existe." });
    }
    if (profesional.recordset[0].activo !== true) {
      return res.status(400).json({ error: "Ese profesional no está disponible para recibir reservas." });
    }

    // La hora tiene que ser una de las que el profesional atiende ese día.
    const slots = await slotsAtendiblesDelDia(db, idProfesional, diaNum);
    if (!slots.includes(hora)) {
      return res.status(400).json({ error: "Ese horario está fuera del horario de atención del profesional." });
    }

    // El admin pudo bloquear ese horario puntual o el día entero (hora NULL).
    if (await estaBloqueado(db, idProfesional, fecha, hora)) {
      return res.status(409).json({ error: "Ese horario está bloqueado. Elegí otro horario disponible." });
    }

    // ── Chequeo de ocupación + INSERT, EN UNA TRANSACCIÓN SERIALIZABLE ──
    // Antes eran dos consultas sueltas y eso era una carrera: si dos clientes
    // confirmaban el mismo slot en el mismo instante, los dos leían "libre" y
    // los dos insertaban (doble reserva). Con SERIALIZABLE el segundo SELECT
    // espera el lock del primero y al releer ya ve el turno nuevo, así que
    // solo uno pasa y el otro recibe el 409 de abajo.
    // (Refuerzo ideal a futuro: un índice UNIQUE en
    //  (idProfesional, fecha, horaInicio) — ver BD/TurnosBarberia.sql.)
    const transaction = new sql.Transaction(db);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const ocupado = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, idProfesional)
        .input("fecha", sql.Date, fecha)
        .input("horaInicio", sql.VarChar, hora)
        .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND (estado IS NULL OR estado <> 'Cancelado')");

      if (ocupado.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ error: "Ese horario ya fue reservado. Elegí otro horario disponible." });
      }

      // INSERT: guarda una "foto" del precio y la duración al momento de
      // reservar, por si después cambian en el catálogo (el turno histórico
      // no debe alterarse). estado arranca en 'Confirmado'.
      const result = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, idProfesional)
        .input("idCliente", sql.Int, idCliente)
        .input("idServicio", sql.Int, idServicio)
        .input("fecha", sql.Date, fecha)
        .input("horaInicio", sql.VarChar, hora)
        .input("duracion", sql.Int, duracion_minutos)
        .input("precio", sql.Decimal(10, 2), precio)
        .input("telefono", sql.VarChar, telefono || null)
        .input("estado", sql.VarChar, 'Confirmado')
        .query(`
          INSERT INTO Turno (idProfesional, idCliente, idServicio, fecha, horaInicio, duracionReal, precioTotal, telefono, estado)
          OUTPUT INSERTED.idTurno
          VALUES (@idProfesional, @idCliente, @idServicio, @fecha, @horaInicio, @duracion, @precio, @telefono, @estado)
        `);

      await transaction.commit();
      res.status(201).json({ mensaje: "Turno reservado.", idTurno: result.recordset[0].idTurno });
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
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
    // Trae el turno con la fecha y la hora YA como texto (CONVERT) para poder
    // aplicar la regla de las 24 h sin que corran un día/una hora por la zona
    // horaria (ver la nota de TIME en la cabecera de este archivo).
    const turno = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("SELECT idCliente, CONVERT(varchar(10), fecha, 23) AS fecha, CONVERT(varchar(5), horaInicio, 108) AS horaIso FROM Turno WHERE idTurno = @id");
    if (turno.recordset.length === 0) return res.status(404).json({ error: "Turno no encontrado." });
    const { idCliente, fecha, horaIso } = turno.recordset[0];
    // Dueño del turno, o admin.
    if (req.user.role !== 'admin' && Number(req.user.idCliente) !== Number(idCliente)) {
      return res.status(403).json({ error: "No tenés permiso para cancelar este turno." });
    }
    // Solo al cliente lo traba la antelación: el admin puede tocar cualquier
    // turno incluso sobre la hora (para corregir errores de agenda).
    if (req.user.role !== 'admin' && tieneMenosDe24h(fecha, horaIso)) {
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
      .query("SELECT idCliente, idProfesional, fecha, CONVERT(varchar(10), fecha, 23) AS fechaIso, CONVERT(varchar(5), horaInicio, 108) AS horaIso FROM Turno WHERE idTurno = @id");
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
    // Y tiene que ser uno de los que el frontend manda. Antes se guardaba el
    // string crudo si no coincidía con el mapa, y un estado inventado cuenta
    // como "NO cancelado" en los cinco filtros `estado <> 'Cancelado'`: el
    // slot quedaba bloqueado para siempre sin que nada lo explicara.
    if (estado !== undefined) {
      const mapaEstados = { pending: 'Confirmado', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'NoSePresento', cancelled: 'Cancelado' };
      if (!Object.prototype.hasOwnProperty.call(mapaEstados, estado)) {
        return res.status(400).json({ error: "El estado indicado no es válido." });
      }
    }
    // Reprogramar es tan "liberar el horario" como cancelar, así que lleva la
    // misma antelación de 24 h. Se mide sobre el turno ACTUAL (el que se está
    // por liberar), no sobre el nuevo: arrastrar un turno de la semana que
    // viene a otra fecha no es una cancelación de último momento.
    if (req.user.role !== 'admin' && (fecha !== undefined || horaInicio !== undefined) && tieneMenosDe24h(turnoActual.fechaIso, turnoActual.horaIso)) {
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
    // OJO: se usa fechaIso (el 'YYYY-MM-DD' del SELECT de arriba), NO
    // turnoActual.fecha (que viene como objeto Date de SQL Server). Pasarle el
    // Date crudo a .input("fecha", sql.Date, ...) dependía de que el driver lo
    // serializara bien; con fechaIso la comparación es inequívoca.
    const fechaFinal = fecha !== undefined ? fecha : turnoActual.fechaIso;
    const horaFinal = horaInicio !== undefined ? normalizarHora(horaInicio) : turnoActual.horaIso;

    // Mismas dos validaciones que la reserva, para el cliente que reprograma:
    // el destino tiene que ser un horario que el profesional atiende y que el
    // admin no bloqueó. El admin queda exceptuado (es quien puede corregir la
    // agenda a mano, incluso para acomodar a alguien fuera de horario).
    // OJO: solo aplican si el cliente está moviendo fecha, hora o profesional;
    // si solo cambia el teléfono o el nombre, el turno ya está en la base con
    // un horario que el propio admin guardó y no hay nada que revalidar.
    if (req.user.role !== 'admin' && (fecha !== undefined || horaInicio !== undefined || idProfesional !== undefined)) {
      if (!horaFinal) return res.status(400).json({ error: "El horario no tiene un formato válido (se espera HH:MM)." });
      const diaFinal = new Date(`${fechaFinal}T00:00:00`).getDay();
      const slotsFinal = await slotsAtendiblesDelDia(db, profFinal, diaFinal);
      if (!slotsFinal.includes(horaFinal)) {
        return res.status(400).json({ error: "Ese horario está fuera del horario de atención del profesional." });
      }
      if (await estaBloqueado(db, profFinal, fechaFinal, horaFinal)) {
        return res.status(409).json({ error: "Ese horario está bloqueado. Elegí otro horario disponible." });
      }
    }

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
    // SERIALIZABLE (no el default READ COMMITTED) porque el chequeo de
    // ocupación tiene que insepararse del UPDATE. Si el SELECT va afuera,
    // entre que responde y se escribe el UPDATE se cuela otra request que
    // pueda reservar o reprogramar al mismo horario, y las dos escriben.
    // Es el mismo motivo y el mismo nivel que ya usa POST /turnos.
    const transaction = new sql.Transaction(db);
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      // --- Chequeo de ocupación, ADENTRO de la transacción ---
      // idTurno <> @id excluye este mismo turno, que si no siempre se
      // chocaría consigo mismo al reprogramlo a su propio horario.
      const ocupado = await new sql.Request(transaction)
        .input("idProfesional", sql.Int, profFinal)
        .input("fecha", sql.Date, fechaFinal)
        .input("horaInicio", sql.VarChar, horaFinal)
        .input("id", sql.Int, req.params.id)
        .query("SELECT idTurno FROM Turno WHERE idProfesional = @idProfesional AND fecha = @fecha AND horaInicio = @horaInicio AND idTurno <> @id AND (estado IS NULL OR estado <> 'Cancelado')");
      if (ocupado.recordset.length > 0) {
        await transaction.rollback();
        return res.status(409).json({ error: "Ese horario ya fue reservado para ese profesional. Elegí otro horario disponible." });
      }

      // --- Parte 1: UPDATE del turno (campos dinámicos) ---
      const set = [];
      const reqPatch = new sql.Request(transaction).input("id", sql.Int, req.params.id);
      if (idProfesional !== undefined) { set.push("idProfesional = @idProfesional"); reqPatch.input("idProfesional", sql.Int, idProfesional); }
      if (idServicio !== undefined) { set.push("idServicio = @idServicio"); reqPatch.input("idServicio", sql.Int, idServicio); }
      if (fecha !== undefined) { set.push("fecha = @fecha"); reqPatch.input("fecha", sql.Date, fecha); }
      // Se guarda SIEMPRE normalizada a 'HH:MM' (horaFinal ya lo está): así
      // la columna TIME queda con un único formato y las comparaciones de
      // ocupación no dependen de cómo lo escribió el cliente.
      if (horaInicio !== undefined) { set.push("horaInicio = @horaInicio"); reqPatch.input("horaInicio", sql.VarChar, horaFinal); }
      if (estado !== undefined) {
        // Traduce el estado del frontend (inglés) al de la DB (español).
        // 'expired' no está: es un estado LÓGICO del frontend (turno que ya
        // pasó), no algo que se guarde. Ya se validó arriba que la clave
        // existe, así que la traduzco directo.
        const mapaEstado = { pending: 'Confirmado', confirmed: 'Confirmado', completed: 'Completado', 'no-show': 'NoSePresento', cancelled: 'Cancelado' };
        set.push("estado = @estado");
        reqPatch.input("estado", sql.VarChar, mapaEstado[estado]);
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
      // El try/catch del rollback es a propósito: rollback() RECHAZA si la
      // transacción ya fue abortada, y sin esto esa excepción tapaba el error
      // real en el log (quedaba el TransactionError en vez de la causa).
      try { await transaction.rollback(); } catch {}
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