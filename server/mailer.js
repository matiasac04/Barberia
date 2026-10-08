require("dotenv").config();
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASS,
  },
});

async function enviarMail({ para, asunto, html }) {
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASS) {
    throw new Error("Faltan GMAIL_USER / GMAIL_APP_PASS en el .env del server.");
  }
  await transporter.sendMail({
    from: `"Barberia" <${process.env.GMAIL_USER}>`,
    to: para,
    subject: asunto,
    html,
  });
}

function formatearFecha(fecha) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${fecha}T00:00:00`));
}

function htmlConfirmacionTurno({ cliente, servicio, profesional, fecha, hora, precio, duracion }) {
  const fechaLegible = formatearFecha(fecha);
  const precioArs = Number(precio).toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: 0,
  });

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

module.exports = { enviarMail, htmlConfirmacionTurno, formatearFecha };
