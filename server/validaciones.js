// ═══════════════════════════════════════════════════════════════════
//  validaciones.js — VALIDACIONES DE ENTRADA COMPARTIDAS
//  ═══════════════════════════════════════════════════════════════════
//  ¿POR QUÉ EXISTE ESTE ARCHIVO?
//  Estas cuatro funciones estaban repetidas (o directamente ausentes) en
//  varios handlers, y la ausencia se notaba en producción: una fecha como
//  "no-es-fecha" o "2026-13-45" llegaba sin chequear hasta SQL Server, que la
//  convertía a NULL y reventaba la query → la API respondía 500 "Error interno"
//  en vez de un 400 con un mensaje que le sirve al usuario.
//
//  Regla general del proyecto: lo que viene del cliente (body, query string)
//  se valida ACÁ, antes de tocar la base. Ningún endpoint debería poder
//  provocar un 500 con un input crafted a mano.
//
//  Todas devuelven booleanos o mensajes, no lanzan excepciones: los handlers
//  deciden el status code y el texto, así que cada ruta puede armar su propio
//  mensaje sin que este archivo sepa de español rioplatense.
//  ═══════════════════════════════════════════════════════════════════

// ── Fechas ───────────────────────────────────────────────
//
// Formato EXIGIDO: 'AAAA-MM-DD'. No se acepta 'DD/MM/AAAA' ni nada con hora
// porque la columna Turno.fecha es un DATE y se compara con =
// (necesario para el chequeo de ocupación), y la comparación depende de que
// ambos lados tengan exactamente el mismo formato.
const esFechaIsoValida = (valor) => {
    if (typeof valor !== "string") return false;
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
    if (!m) return false;
    const anio = Number(m[1]);
    const mes = Number(m[2]);
    const dia = Number(m[3]);
    if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return false;
    // El round-trip es lo que detecta las fechas que NO existen, como el
    // 31/02: new Date(2026, 1, 31) no da error, "se corrige" solo al 03/03.
    // Si comparamos las tres partes contra las que vienen, el salto se nota.
    const d = new Date(Date.UTC(anio, mes - 1, dia));
    return d.getUTCFullYear() === anio && d.getUTCMonth() === mes - 1 && d.getUTCDate() === dia;
};

// Devuelve null si la fecha está bien, o el mensaje de error si no.
// Se usa así: const err = errorFecha(fecha); if (err) return res.status(400)…
const errorFecha = (valor) =>
    esFechaIsoValida(valor) ? null : "La fecha no tiene un formato válido (se espera AAAA-MM-DD).";

// ── Horas ────────────────────────────────────────────────
//
// Formato EXIGIDO: 'HH:MM' en 24 hs. Las columnas horaInicio/horaSalida/
// hora son TIME, y el chequeo de ocupación compara con = sobre ese string
// normalizado. "9:00" o "09:00:00" romperían la comparación silenciosamente.
const esHoraValida = (valor) => {
    if (typeof valor !== "string") return false;
    const m = /^(\d{2}):(\d{2})$/.exec(valor.trim());
    if (!m) return false;
    const h = Number(m[1]);
    const min = Number(m[2]);
    return h >= 0 && h <= 23 && min >= 0 && min <= 59;
};

const errorHora = (valor) =>
    esHoraValida(valor) ? null : "La hora no tiene un formato válido (se espera HH:MM).";

// ── Contraseñas ──────────────────────────────────────────
//
// Mínimo 8 caracteres. Antes no había mínimo: la API aceptaba registrarse con
// password "1" (verificado, devolvía 201). Con login por email + contraseña,
// una contraseña de un carácter es trivial de adivinar por fuerza bruta, y el
// rate limit de 20 intentos cada 15 min es la única defensa.
//
// OJO sobre el máximo: bcrypt.js trunca silenciosamente a 72 BYTES, no a 72
// caracteres. Con acentos o emojis 72 caracteres pueden ser más de 72 bytes y
// dos contraseñas distintas dan el mismo hash. Por eso el máximo se mide en
// bytes y no en caracteres.
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72;

const passwordValida = (valor) => {
    if (typeof valor !== "string" || !valor) return false;
    if (valor.length < PASSWORD_MIN) return false;
    return Buffer.byteLength(valor, "utf8") <= PASSWORD_MAX_BYTES;
};

const errorPassword = (valor) => {
    if (typeof valor !== "string" || !valor) return "Falta la contraseña.";
    if (valor.length < PASSWORD_MIN) return `La contraseña debe tener al menos ${PASSWORD_MIN} caracteres.`;
    if (Buffer.byteLength(valor, "utf8") > PASSWORD_MAX_BYTES) return "La contraseña es demasiado larga.";
    return null;
};

// ── Números ──────────────────────────────────────────────
//
// Los ids vienen del body o de la URL como texto. Number("3abc") da NaN y un
// NaN que se pasa a .input(..., sql.Int, NaN) llega a la base como NULL, que en
// una FK da un error 500 incomprensible en vez de un 404.
const esIdValido = (valor) => {
    const n = Number(valor);
    return Number.isInteger(n) && n > 0;
};

// OJO: acá se llama esIdValido (con -o) y no esIdValida. Con el typo,
// errorId() tiraba ReferenceError en cada llamada: /turnos/disponibles con un
// idProfesional inválido respondía 500 por una excepción, no por el dato malo.
const errorId = (valor) => (esIdValido(valor) ? null : "El identificador no es válido.");

module.exports = {
    esFechaIsoValida,
    errorFecha,
    esHoraValida,
    errorHora,
    PASSWORD_MIN,
    passwordValida,
    errorPassword,
    esIdValido,
    errorId,
};