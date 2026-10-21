// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   require("dotenv") / nodemailer    → L27
//   transporter (SMTP Gmail)          → L36
//   enviarMail({ para, asunto, html })→ L57
//   formatearFecha(fecha)             → L75
//   htmlConfirmacionTurno(datos)      → L86
//   htmlRecuperacionPassword(datos)   → L128
//   module.exports                    → L146
// ═══════════════════════════════════════════════════════════════════
// server/mailer.js — ENVÍO DE MAILS (turnos y recuperación de clave)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Módulo aislado que envía los mails de la app: confirmación cuando un cliente
// reserva un turno (lo llama POST /turnos en rutasTurnos.js) y link para
// restablecer la contraseña (lo llama POST /recuperar en rutasSesion.js).
// Usa nodemailer con una cuenta de Gmail y una "App Password".
//
// El envío es "best effort": el llamador lo dispara DESPUÉS de responder al
// cliente y con su propio catch, así que si Gmail falla (sin credenciales,
// límite diario, caída) la reserva ya quedó confirmada en la base igual.
//
// Credenciales en server/.env: GMAIL_USER y GMAIL_APP_PASS (nunca en el repo).
// ═══════════════════════════════════════════════════════════════════
require("dotenv").config();
const nodemailer = require("nodemailer");

// transporter: la conexión SMTP de Gmail que reutiliza nodemailer. Se crea
// una sola vez al cargar el módulo (no en cada mail).
// Ojo con cuándo se arma: crearlo NO valida credenciales. Si el .env no tiene
// GMAIL_USER / GMAIL_APP_PASS, el transporter queda igual, con undefined
// adentro, y el error recién estalla al intentar enviar. Por eso enviarMail()
// vuelve a chequear las variables más abajo.
const transporter = nodemailer.createTransport({
  // "gmail" es un atajo de nodemailer: resuelve solo el SMTP de Google con
  // TLS en el puerto 465, sin cargar host/puerto a mano. Si algún día se
  // cambia de proveedor, hay que reemplazar esto por { host, port, secure }.
  service: "gmail",
  auth: {
    // GMAIL_APP_PASS NO es la contraseña de la cuenta de Google: es una
    // "contraseña de aplicación" de 16 caracteres que se genera en Cuenta de
    // Google → Seguridad (hace falta tener la verificación en dos pasos
    // activada). Gmail bloquea el login SMTP con la contraseña real, así que
    // con una normal el envío falla con "Authentication failed". Ambas
    // credenciales viven en server/.env: si se filtraran, cualquiera podría
    // mandar mails desde la cuenta hasta que se revoque el permiso.
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

// enviarMail({ para, asunto, html }): envía un mail por Gmail.
// Falla rápido si faltan las credenciales, con un mensaje claro. El error
// sube al llamador, que lo loguea sin romper la reserva ya confirmada.
async function enviarMail({ para, asunto, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    throw new Error("Faltan GMAIL_USER / GMAIL_APP_PASS en el .env del server.");
  }
  await transporter.sendMail({
    // El "from" tiene que ser la MISMA cuenta que se autentica: Gmail rechaza
    // los envíos que se presentan como otro remitente. Lo que está entre
    // comillas es solo el nombre visible que ve el cliente en su casilla.
    from: `"Barberia" <${process.env.GMAIL_USER}>`,
    to: para,
    subject: asunto,
    html,
  });
}

// formatearFecha('2026-10-24'): fecha legible en es-AR ("sábado, 24 de octubre
// de 2026"). El 'T00:00:00' fuerza hora local y evita que el date se corra
// un día por la zona horaria.
function formatearFecha(fecha) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T00:00:00`));
}

// htmlConfirmacionTurno(...): arma el HTML del mail (tabla con servicio,
// profesional, fecha, hora, duración y total formateado en ARS).
function htmlConfirmacionTurno({ cliente, servicio, profesional, fecha, hora, precio, duracion }) {
  const fechaLegible = formatearFecha(fecha);
  // Number(precio) normaliza antes de formatear: SQL Server devuelve los
  // DECIMAL como texto (para no perder precisión) y, si el valor llegara como
  // string, Intl ignoraría las opciones de estilo y el precio quedaría crudo,
  // sin "$" ni separadores. minimumFractionDigits 0 → "$15.000" en vez de
  // "$ 15.000,00": los precios de la lista ya se manejan enteros.
  const precioArs = Number(precio).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  });

  // El HTML va como template literal con estilos INLINE (atributo style,
  // nunca <style>) y con tablas para alinear: es lo único que los clientes de
  // mail respetan de forma pareja (Gmail recorta parte de lo que va dentro de
  // <style> y Outlook entiende poco del CSS actual, pero el atributo style de
  // una celda pasa siempre).
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f4; padding:24px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; padding:32px; color:#222222;">
      <h1 style="margin:0 0 4px; font-size:22px;">¡Turno reservado!</h1>
      <p style="margin:0 0 24px; color:#555555;">Hola ${cliente}, tu turno en Barberia quedó confirmado.</p>
      <table style="width:100%; border-collapse:collapse; font-size:15px;">
        <tr><td style="padding:8px 0; color:#777777;">Servicio</td><td style="padding:8px 0; text-align:right;"><strong>${servicio}</strong></td></tr>
        <tr><td style="padding:8px 0; color:#777777;">Profesional</td><td style="padding:8px 0; text-align:right;"><strong>${profesional}</strong></td></tr>
        <tr><td style="padding:8px 0; color:#777777;">Fecha</td><td style="padding:8px 0; text-align:right;"><strong>${fechaLegible}</strong></td></tr>
        <tr><td style="padding:8px 0; color:#777777;">Hora</td><td style="padding:8px 0; text-align:right;"><strong>${hora} hs</strong></td></tr>
        <tr><td style="padding:8px 0; color:#777777;">Duración</td><td style="padding:8px 0; text-align:right;"><strong>${duracion} min</strong></td></tr>
        <tr style="border-top:1px solid #eeeeee;"><td style="padding:12px 0 0; color:#777777;">Total</td><td style="padding:12px 0 0; text-align:right;"><strong>${precioArs}</strong></td></tr>
      </table>
      <p style="margin:24px 0 0; font-size:13px; color:#888888;">
        Si necesitás cancelar o reprogramar, hacelo desde la app con al menos 24 horas de antelación.
      </p>
    </div>
  </div>`;
}

// htmlRecuperacionPassword(...): arma el HTML del mail con el link para
// restablecer la contraseña. Mismo criterio que el mail de turno: estilos
// inline, una columna y un único botón como acción principal.
// El enlace ya viene armado desde rutasSesion.js (FRONTEND_URL + token).
function htmlRecuperacionPassword({ nombre, enlace }) {
  return `
  <div style="font-family: Arial, Helvetica, sans-serif; background:#f4f4f4; padding:24px;">
    <div style="max-width:520px; margin:auto; background:#ffffff; border-radius:8px; padding:32px; color:#222222;">
      <h1 style="margin:0 0 4px; font-size:22px;">Restablecé tu contraseña</h1>
      <p style="margin:0 0 20px; color:#555555;">Hola ${nombre}, recibimos un pedido para cambiar la contraseña de tu cuenta en Barberia.</p>
      <p style="margin:0 0 24px;">
        <a href="${enlace}" style="display:inline-block; background:#222222; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:6px; font-weight:bold;">Elegir nueva contraseña</a>
      </p>
      <p style="margin:0 0 8px; font-size:13px; color:#888888;">El link vence en 1 hora y sirve una sola vez.</p>
      <p style="margin:0; font-size:13px; color:#888888;">Si no pediste este cambio, ignorá este mail: tu contraseña actual sigue funcionando.</p>
    </div>
  </div>`;
}

// Piezas que usa el resto del server: enviarMail dispara el envío,
// htmlConfirmacionTurno y htmlRecuperacionPassword arman el cuerpo de cada
// mail, y formatearFecha deja la fecha legible para el asunto del turno.
module.exports = { enviarMail, htmlConfirmacionTurno, htmlRecuperacionPassword, formatearFecha };
