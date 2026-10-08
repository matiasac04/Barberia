// ═══════════════════════════════════════════════════════════════════
// server/rutas/rutasProfesionales.js — PROFESIONALES, HORARIOS Y BLOQUEOS
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Este archivo maneja todo lo que define QUIÉN ATIENDE y CUÁNDO:
//
//   GET    /profesionales                    → lista (requiere token)
//   POST   /profesionales                    → crea         (solo admin)
//   DELETE /profesionales/:id                → da de baja   (solo admin)
//   PATCH  /profesionales/:id                → edita        (solo admin)
//   GET    /horarios                         → horarios de todos (con token)
//   PUT    /profesionales/:id/horarios       → reemplaza el horario semanal
//   GET    /bloqueos                         → bloqueos de todos (con token)
//   POST   /profesionales/:id/bloqueos       → reemplaza los bloqueos de un día
//
// TRES DECISIONES DE DISEÑO QUE VALE LA PENA ENTENDER:
//
// 1. LA BAJA ES LÓGICA, NO FÍSICA.
//    DELETE pone activo = 0 en vez de borrar la fila. Motivo: si un
//    profesional tiene turnos PASSADOS, borrarlo rompería el historial (o
//    lo dejaría huérfano). Con la baja lógica el turno viejo sigue
//    mostrando a su profesional, pero el cliente ya no puede reservar con él
//    (el GET sin incluirInactivos lo filtra por activo = 1).
//
// 2. EL EMAIL ES OBLIGATORIO EN LA DB, PERO NO EN LA UI.
//    La tabla Profesional tiene email UNIQUE. Si el admin no lo carga, se
//    genera uno interno fictitious (prof_<timestamp>_<random>@barberia.local)
//    para no romper el UNIQUE. Por eso crear SÍ puede dar 409 si el admin
//    cargó un email repetido a propósito.
//
// 3. HORARIOS Y BLOQUEOS SE REEMPLAZAN, NO SE PARCHEAN.
//    PUT /horarios borra TODAS las filas del profesional e inserta las
//    nuevas; POST /bloqueos borra las de ESE DÍA e inserta las nuevas.
//    Van en transacción: si un INSERT falla a la mitad, no queda un
//    professional con la mitad de su horario viejo y la mitad del nuevo.
const router = require("express").Router();

const { sql, getPool } = require("../conexion");
const { jwtMiddleware, requireAdmin } = require("../autenticacion");
const { errorFecha, errorHora } = require("../validaciones");

// ── Helpers de profesionales ──────────────────────────
// generarEmailProfesional(): email interno válido y único para cuando el
// admin no carga uno. El timestamp + random garantizan que no colisione
// con el UNIQUE de la columna email.
const generarEmailProfesional = () => `prof_${Date.now()}_${Math.floor(Math.random() * 1000000)}@barberia.local`;
// normalizarEmailOpcional(): '' / null / undefined → null; si hay valor,
// lo recorta. Evita guardar strings vacíos que ensucian el UNIQUE.
const normalizarEmailOpcional = (email) => (email && String(email).trim() ? String(email).trim() : null);

// ── CRUD profesionales ────────────────────────────────
// GET /profesionales?incluirInactivos=1
// Sin ese query param → solo los activos (los que ve el turnero).
// Con "1" → todos (lo usa el panel admin para poder reactivar bajas).
// El SELECT arma el nombre completo con LTRIM/RTRIM para que no queden
// espacios dobles cuando el apellido es NULL.
//
// Exige token (jwtMiddleware) porque la respuesta trae email y teléfono del
// staff: sin pedirlo, cualquiera podría scrapear los datos de contacto de
// todos los profesionales desde el navegador. No le hace falta al turnero sin
// sesión: el frontend solo pide esta lista cuando ya está logueado.
router.get("/profesionales", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const incluirInactivos = req.query.incluirInactivos === "1";
    const queryBase = "SELECT idProfesional, LTRIM(RTRIM(nombre + ' ' + ISNULL(apellido, ''))) AS nombre, email, telefono, activo FROM Profesional";
    const query = incluirInactivos ? `${queryBase} ORDER BY idProfesional` : `${queryBase} WHERE activo = 1 ORDER BY idProfesional`;
    const result = await db.request().query(query);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener profesionales." });
  }
});

// POST /profesionales — alta (solo admin). Solo el nombre es obligatorio;
// apellido/telefono pueden ir vacíos, y el email se genera si no viene.
router.post("/profesionales", jwtMiddleware, requireAdmin, async (req, res) => {
  const { nombre, apellido, email, telefono } = req.body;
  if (!nombre || !String(nombre).trim()) {
    return res.status(400).json({ error: "El nombre del profesional es obligatorio." });
  }
  try {
    const db = await getPool();
    const apellidoFinal = apellido && String(apellido).trim() ? String(apellido).trim() : null;
    // Si no hay email → generado. Si hay → el que cargó el admin.
    const emailFinal = normalizarEmailOpcional(email) || generarEmailProfesional();
    const result = await db.request()
      .input("nombre", sql.VarChar, String(nombre).trim())
      .input("apellido", sql.VarChar, apellidoFinal)
      .input("email", sql.VarChar, emailFinal)
      .input("telefono", sql.VarChar, telefono || null)
      .query(`
        INSERT INTO Profesional (nombre, apellido, email, telefono)
        OUTPUT INSERTED.idProfesional
        VALUES (@nombre, @apellido, @email, @telefono)
      `);
    res.status(201).json({ mensaje: "Profesional registrado.", idProfesional: result.recordset[0].idProfesional });
  } catch (error) {
    // 2627/2601 = violación de índice único (email repetido).
    const violacionUnica = error?.number === 2627 || error?.number === 2601;
    if (violacionUnica) {
      return res.status(409).json({ error: "Ya existe un profesional con ese mail. Usá otro o dejá el mail vacío." });
    }
    console.error(error);
    res.status(500).json({ error: "Error al registrar profesional." });
  }
});

// DELETE /profesionales/:id — BAJA LÓGICA (solo admin): activo = 0.
// No borra la fila (ver el punto 1 de la cabecera).
router.delete("/profesionales/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .input("id", sql.Int, req.params.id)
      .query("UPDATE Profesional SET activo = 0 WHERE idProfesional = @id");
    if (result.rowsAffected[0] === 0) return res.status(404).json({ error: "Profesional no encontrado." });
    res.json({ mensaje: "Profesional dado de baja." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al dar de baja profesional." });
  }
});

// PATCH /profesionales/:id — edición parcial (solo admin).
// Casos de uso: editar nombre/telefono, o el toggle activar/desactivar
// (el admin manda { activo: true/false }). Mismo patrón de SET dinámico que
// servicios. Si no viene ningún campo → 400.
router.patch("/profesionales/:id", jwtMiddleware, requireAdmin, async (req, res) => {
  try {
    const db = await getPool();
    const id = req.params.id;
    const set = [];
    const reqPatch = db.request().input("id", sql.Int, id);

    if (req.body.nombre !== undefined) {
      set.push("nombre = @nombre");
      reqPatch.input("nombre", sql.VarChar, req.body.nombre);
    }
    if (req.body.apellido !== undefined) {
      set.push("apellido = @apellido");
      reqPatch.input("apellido", sql.VarChar, req.body.apellido && String(req.body.apellido).trim() ? String(req.body.apellido).trim() : null);
    }
    if (req.body.telefono !== undefined) {
      set.push("telefono = @telefono");
      reqPatch.input("telefono", sql.VarChar, req.body.telefono || null);
    }
    if (req.body.email !== undefined) {
      // El email tiene un caso especial: si el admin lo borra (viene vacío),
      // NO se deja NULL porque rompería el UNIQUE de los ya existentes.
      // Se lee el actual y, si tampoco sirve, se genera uno interno.
      const cur = await db.request()
        .input("id", sql.Int, id)
        .query("SELECT email FROM Profesional WHERE idProfesional = @id");
      const emailActual = cur.recordset[0]?.email;
      const emailFinal = normalizarEmailOpcional(req.body.email) || (emailActual && String(emailActual).trim()) || generarEmailProfesional();
      set.push("email = @email");
      reqPatch.input("email", sql.VarChar, emailFinal);
    }
    // activo llega como boolean (del toggle del admin) → se guarda como BIT.
    if (typeof req.body.activo === "boolean") {
      set.push("activo = @activo");
      reqPatch.input("activo", sql.Bit, req.body.activo ? 1 : 0);
    }

    if (set.length === 0) return res.status(400).json({ error: "No hay campos para actualizar." });
    await reqPatch.query(`UPDATE Profesional SET ${set.join(", ")} WHERE idProfesional = @id`);
    res.json({ mensaje: "Profesional actualizado." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar profesional." });
  }
});

// ── Horarios laborales ────────────────────────────────
// GET /horarios — toda la tabla HorarioLaboral, en formato LISTO PARA EL JS:
//   diaSemana (2..6 = mar..sáb, según getDay de JS) y las horas como texto
//   'HH:MM' (CONVERT ... 108), no como Time de SQL Server.
// Requiere token porque expone la agenda interna del local.
router.get("/horarios", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT idProfesional, diaSemana,
               CONVERT(varchar(5), horaEntrada, 108) AS horaEntrada,
               CONVERT(varchar(5), horaSalida, 108) AS horaSalida
        FROM HorarioLaboral
        WHERE horaEntrada IS NOT NULL AND horaSalida IS NOT NULL
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener horarios." });
  }
});

// PUT /profesionales/:id/horarios — reemplaza TODO el horario semanal
// (solo admin). Recibe { horarios: [{ diaSemana, horaEntrada, horaSalida }, ...] }.
// En una transacción: borra todas las filas del profesional y reinserta la
// nueva. Si un INSERT falla a la mitad → rollback y no queda un horario
// híbrido (mitad viejo, mitad nuevo).
router.put("/profesionales/:id/horarios", jwtMiddleware, requireAdmin, async (req, res) => {
  const { horarios } = req.body;
  if (!Array.isArray(horarios)) return res.status(400).json({ error: "Falta la lista de horarios." });
  // Cada horario se valida antes de borrar el anterior. Sin esto, un
  // diaSemana faltante o no numérico llegaba como NaN, mssql lo pasaba a NULL y
  // como HorarioLaboral.diaSemana es nullable el INSERT TENÍA ÉXITO con la
  // fila a NULL: un registro invisible que ni el cálculo del servidor ni el
  // del frontend llegan a leer jamás.
  for (const h of horarios) {
    const dia = Number(h && h.diaSemana);
    if (!Number.isInteger(dia) || dia < 0 || dia > 6) {
      return res.status(400).json({ error: "El día de la semana debe ser un número del 0 (domingo) al 6 (sábado)." });
    }
    if (h.horaEntrada != null) {
      const e = errorHora(h.horaEntrada);
      if (e) return res.status(400).json({ error: `horaEntrada: ${e}` });
    }
    if (h.horaSalida != null) {
      const e = errorHora(h.horaSalida);
      if (e) return res.status(400).json({ error: `horaSalida: ${e}` });
    }
    // Una franja invertida no es un error de SQL: se guarda y el cálculo del
    // servidor la descarta con un `continue`, así que el admin veía el horario
    // guardado en el panel y el turno nunca aparecía como reservable.
    if (h.horaEntrada != null && h.horaSalida != null && h.horaSalida <= h.horaEntrada) {
      return res.status(400).json({ error: "La hora de salida tiene que ser posterior a la de entrada." });
    }
  }
  try {
    const db = await getPool();
    const profesionalId = Number(req.params.id);
    // Que el profesional exista se verifica ANTES de abrir la transacción.
    // Antes no se comprobaba nada: un PUT a /profesionales/99999/horarios
    // borraba cero filas, insertaba cero y respondía 200 "Horarios
    // actualizados.", así que el admin creía haber guardado el horario de un
    // profesional que no existe (la FK solo lo frenaría si algún día se
    // mandara un id de veras, y ahí el error salía como 500, no como 404).
    const existe = await new sql.Request(db)
      .input("id", sql.Int, profesionalId)
      .query("SELECT idProfesional FROM Profesional WHERE idProfesional = @id");
    if (existe.recordset.length === 0) {
      return res.status(404).json({ error: "Profesional no encontrado." });
    }
    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {
      // Paso 1: borrar el horario anterior de este profesional.
      await new sql.Request(transaction)
        .input("id", sql.Int, profesionalId)
        .query("DELETE FROM HorarioLaboral WHERE idProfesional = @id");

      // Paso 2: insertar el nuevo (si viene lista; si viene vacía = "no trabaja").
      if (horarios.length > 0) {
        for (const h of horarios) {
          await new sql.Request(transaction)
            .input("idProfesional", sql.Int, profesionalId)
            .input("diaSemana", sql.Int, Number(h.diaSemana))
            .input("horaEntrada", sql.VarChar, h.horaEntrada != null ? h.horaEntrada : null)
            .input("horaSalida", sql.VarChar, h.horaSalida != null ? h.horaSalida : null)
            .query(`INSERT INTO HorarioLaboral (idProfesional, diaSemana, horaEntrada, horaSalida) VALUES (@idProfesional, @diaSemana, @horaEntrada, @horaSalida)`);
        }
      }

      await transaction.commit();
      res.json({ mensaje: "Horarios actualizados." });
    } catch (error) {
      try { await transaction.rollback(); } catch {}
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al actualizar horarios." });
  }
});

// ── Bloqueos por fecha ────────────────────────────────
// GET /bloqueos — todos los bloqueos (con token). Fecha como texto
// 'YYYY-MM-DD'. El frontend los usa para tapar slots en el calendario y en
// el cálculo de disponibles (horariosLibresDelDia).
router.get("/bloqueos", jwtMiddleware, async (req, res) => {
  try {
    const db = await getPool();
    const result = await db.request()
      .query(`
        SELECT idProfesional, CONVERT(varchar(10), fecha, 23) AS fecha, hora
        FROM BloqueoHorario
      `);
    res.json(result.recordset);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al obtener bloqueos." });
  }
});

// POST /profesionales/:id/bloqueos — reemplaza los bloqueos de UN DÍA
// (solo admin). Body: { fecha, diaCompleto?, slots? }.
//   - diaCompleto: true  → inserta UNA fila con hora = NULL. El frontend lo
//     interpreta como "todo el día bloqueado" (bloqueosDeLaFecha).
//   - slots: [...]       → inserta una fila por horario.
// Siempre borra primero las de esa fecha, así el admin puede "desbloquear
// todo" mandando slots: [] sin borrar filas a mano. Va en transacción.
router.post("/profesionales/:id/bloqueos", jwtMiddleware, requireAdmin, async (req, res) => {
  const { fecha, diaCompleto, slots } = req.body || {};
  if (!fecha) return res.status(400).json({ error: "Falta la fecha." });
  const errFecha = errorFecha(fecha);
  if (errFecha) return res.status(400).json({ error: errFecha });
  // Un body incompleto soltaba un DELETE que borraba TODOS los bloqueos de ese
  // día y no insertaba nada: es decir, "desbloquear todo el día" pasaba
  // escribiéndolo como si fuera un error tipográfico. Ahora tiene que decir
  // explícitamente slots: [] para desbloquear.
  if (!diaCompleto && !Array.isArray(slots)) {
    return res.status(400).json({ error: 'Mandá "diaCompleto": true para bloquear el día entero, o "slots": [] para desbloquearlo.' });
  }
  // Los slots se validan ANTES de borrar nada. Además se filtra el caso
  // peligroso: una hora NULL en BloqueoHorario significa "día completo
  // bloqueado" (es así como lo interpreta el servidor al leer y el frontend
  // al calcular la disponibilidad). Antes, un null perdido dentro del array
  // terminaba bloqueando el día entero cuando el admin intención era liberar
  // un solo horario.
  if (Array.isArray(slots)) {
    for (const slot of slots) {
      if (slot == null) continue; // no bloquear nada (se traducía en "cerrar el día")
      const errHora = errorHora(slot);
      if (errHora) return res.status(400).json({ error: `Slot inválido: ${errHora}` });
    }
  }
  try {
    const db = await getPool();
    // Que el profesional exista, verificado antes de borrar. Antes un POST a
    // /profesionales/99999/bloqueos borraba cero, insertaba cero y devolvía
    // 200 "Bloqueos actualizados."
    const existe = await new sql.Request(db)
      .input("id", sql.Int, req.params.id)
      .query("SELECT idProfesional FROM Profesional WHERE idProfesional = @id");
    if (existe.recordset.length === 0) {
      return res.status(404).json({ error: "Profesional no encontrado." });
    }
    const transaction = new sql.Transaction(db);
    await transaction.begin();
    try {
      // Borra los bloqueos previos de ESE profesional + ESA fecha.
      await new sql.Request(transaction)
        .input("id", sql.Int, req.params.id)
        .input("fecha", sql.Date, fecha)
        .query("DELETE FROM BloqueoHorario WHERE idProfesional = @id AND fecha = @fecha");

      // Caso A: día completo → una sola fila con hora NULL ("cerrado todo").
      if (diaCompleto) {
        await new sql.Request(transaction)
          .input("id", sql.Int, req.params.id)
          .input("fecha", sql.Date, fecha)
          .query("INSERT INTO BloqueoHorario (idProfesional, fecha, hora) VALUES (@id, @fecha, NULL)");
      }
      // Caso B: horarios sueltos → una fila por slot.
      else if (Array.isArray(slots)) {
        for (const slot of slots) {
          // Los null ya se filtraron en la validación de arriba; el filtro se
          // repite acá porque el INSERT con hora=NULL significaría "día
          // completo bloqueado" y el admin que quería liberar 09:00 cerraría
          // las 09:00 a las 17:00 sin darse cuenta.
          if (slot == null) continue;
          await new sql.Request(transaction)
            .input("id", sql.Int, req.params.id)
            .input("fecha", sql.Date, fecha)
            .input("hora", sql.VarChar, slot)
            .query("INSERT INTO BloqueoHorario (idProfesional, fecha, hora) VALUES (@id, @fecha, @hora)");
        }
      }

      await transaction.commit();
      res.json({ mensaje: "Bloqueos actualizados." });
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error al guardar bloqueos." });
  }
});

module.exports = router;