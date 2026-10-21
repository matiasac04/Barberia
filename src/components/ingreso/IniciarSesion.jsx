// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   IniciarSesion() / banderas         → L42
//   títulos / verClave / render        → L48/58/59
//   Formulario registro                → L86
//   Formulario recuperar / restablecer → L107/119
//   Formulario login                   → L133
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// PANTALLA DE INICIO DE SESIÓN / REGISTRO / RECUPERACIÓN
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es la única pantalla visible cuando NO hay sesión activa (App.jsx lo
// detecta: sin token o sin currentUser). Contiene CUATRO formularios en la
// misma pantalla, elegidos por pantallaAcceso:
//
//   'ingreso'      → usuario/mail + contraseña → POST /login (Basic Auth)
//   'registro'     → nombre, apellido, mail, contraseña, whatsapp → /registro
//   'recuperar'    → mail → POST /recuperar (manda el link por correo)
//   'restablecer'  → nueva contraseña + token del link → POST /restablecer
//
// onMostrarRegistro/onMostrarIngreso/onMostrarRecuperar cambian pantallaAcceso
// en App.jsx. La pantalla 'restablecer' se abre sola cuando la URL trae
// ?reset=<token> (el link que llega por mail).
//
// ingresarConGoogle es un MOCK (no hay OAuth real): crea un usuario falso
// con token 'mock-google'. Ese usuario NO puede reservar (App.jsx valida
// idCliente antes de POST /turnos), sirve solo para probar la UI.
//
// avisoAcceso muestra mensajes de éxito/error del proceso (vienen de App.jsx).
// Todos los handlers y valores vienen por props desde App.jsx.
import { useState } from 'react';
import PieDePagina from '../comunes/PieDePagina';
import logoTijera from '../../assets/logo-tijera.svg';
// Componente de autenticación: recibe de App.jsx qué formulario mostrar
// (pantallaAcceso), los estados de los campos (correoIngreso, claveIngreso,
// formularioRegistro, correoRecuperacion, claveNueva) y los handlers
// (iniciarSesion, crearCuenta, pedirRecuperacion, cambiarClave, etc.).
// No tiene lógica de validación propia; eso lo hace App.jsx en los handlers.
function IniciarSesion({ pantallaAcceso, avisoAcceso, iniciarSesion, crearCuenta, ingresarConGoogle, pedirRecuperacion, cambiarClave, correoIngreso, claveIngreso, correoRecuperacion, claveNueva, onMostrarIngreso, onMostrarRegistro, onMostrarRecuperar, formularioRegistro, setCorreoIngreso, setClaveIngreso, setCorreoRecuperacion, setClaveNueva, setFormularioRegistro }) {
  // Banderas de la pantalla activa: solo una puede ser true.
  const esRegistro = pantallaAcceso === 'registro';
  const esRecuperar = pantallaAcceso === 'recuperar';
  const esRestablecer = pantallaAcceso === 'restablecer';
  // Título y bajada de la columna izquierda según la pantalla activa.
  const titulo = esRegistro ? 'Creá tu cuenta' : esRecuperar ? 'Recuperá tu clave' : esRestablecer ? 'Elegí una nueva clave' : 'Iniciá sesión';
  const bajada = esRegistro
    ? 'Completá tus datos para registrarte y después entrar al sistema de turnos.'
    : esRecuperar
      ? 'Te mandamos un link por mail para que puedas elegir una nueva contraseña.'
      : esRestablecer
        ? 'El link es válido por 1 hora y una sola vez. Elegí una clave nueva para tu cuenta.'
        : 'Accedé con tu mail y contraseña para entrar al sistema de turnos.';
  // verClave: alterna el tipo del input de contraseña (password ↔ text)
  // para la función "Mostrar contraseña".
  const [verClave, setVerClave] = useState(false);
  // ── Render de ingreso o registro ────────────────────
  return (
    <main className="simple-page auth-page">
      <section className="simple-hero auth-shell">
        {/* Columna izquierda: identidad de la barbería + copy promocional
            (no cambia entre login y registro). */}
        <div className="auth-copy">
          {/* Logo y nombre: preventDefault evita que el clic recargue la SPA. */}
          <a className="brand-lockup" href="/" onClick={(e) => e.preventDefault()}>
            <span className="brand-mark" aria-hidden="true">
              <img src={logoTijera} alt="" width="30" height="30" />
            </span>
            <span className="brand-text"><strong>Barberia</strong><small>Qué cortecito</small></span>
          </a>
          <span className="simple-tag">Agendá online</span>
          {/* Título y bajada cambian según la pantalla activa. */}
          <h1>{titulo}</h1>
          <p>{bajada}</p>
          <ul className="auth-features">
            <li>Reservá tu turno online en menos de un minuto</li>
            <li>Elegí tu profesional y el servicio que quieras</li>
            <li>Cancelá con 24 h de anticipación sin costo</li>
          </ul>
        </div>
        {/* Formulario de REGISTRO: se muestra solo si esRegistro es true.
            Al enviar llama crearCuenta (App.jsx valida y hace POST /registro). */}
        {esRegistro ? (
          <form className="auth-card" onSubmit={crearCuenta}>
            <div className="auth-card-head"><div><h2>Crear cuenta</h2></div><p>Te pedimos los datos justos para dejar tu perfil listo.</p></div>
            <div className="auth-fields register-fields">
              {/* Cada input actualiza un campo del objeto formularioRegistro
                  con spread (...p) para no pisar los demás campos. */}
              <input type="text" placeholder="Nombre" value={formularioRegistro.nombre} onChange={(e) => setFormularioRegistro((p) => ({ ...p, nombre: e.target.value }))} />
              <input type="text" placeholder="Apellido" value={formularioRegistro.apellido} onChange={(e) => setFormularioRegistro((p) => ({ ...p, apellido: e.target.value }))} />
              <input type="email" placeholder="Mail" value={formularioRegistro.email} onChange={(e) => setFormularioRegistro((p) => ({ ...p, email: e.target.value }))} />
              {/* minLength/maxLength: validación nativa del navegador antes
                  de enviar; el backend también valida la longitud. */}
              <input type="password" placeholder="Contraseña (mínimo 8 caracteres)" minLength={8} maxLength={72} value={formularioRegistro.password} onChange={(e) => setFormularioRegistro((p) => ({ ...p, password: e.target.value }))} />
              <input type="tel" placeholder="WhatsApp" value={formularioRegistro.telefono} onChange={(e) => setFormularioRegistro((p) => ({ ...p, telefono: e.target.value }))} />
            </div>
            <button className="auth-submit primary" type="submit">Crear cuenta</button>
            {/* type="button" evita que actúe como submit; vuelve al login. */}
            <button className="auth-submit secondary" type="button" onClick={onMostrarIngreso}>Volver atrás</button>
            {/* Mensaje de éxito/error del registro (viene de App.jsx). */}
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        ) : esRecuperar ? (
          // Formulario de RECUPERACIÓN: pide el mail y dispara POST /recuperar.
          <form className="auth-card" onSubmit={pedirRecuperacion}>
            <div className="auth-card-head"><div><h2>¿Olvidaste tu contraseña?</h2></div><p>Escribí el mail de tu cuenta y te enviamos un link para elegir una nueva.</p></div>
            <div className="auth-fields">
              <input type="email" placeholder="Mail" value={correoRecuperacion} onChange={(e) => setCorreoRecuperacion(e.target.value)} />
            </div>
            <button className="auth-submit primary" type="submit">Enviar link</button>
            <button className="auth-submit secondary" type="button" onClick={onMostrarIngreso}>Volver al login</button>
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        ) : esRestablecer ? (
          // Formulario de NUEVA CONTRASEÑA: se llega desde el link del mail
          // (?reset=<token>). El token lo guarda App.jsx y viaja en cambiarClave.
          <form className="auth-card" onSubmit={cambiarClave}>
            <div className="auth-card-head"><div><h2>Nueva contraseña</h2></div><p>Elegí una clave de al menos 8 caracteres para tu cuenta.</p></div>
            <div className="auth-fields">
              <input type={verClave ? 'text' : 'password'} placeholder="Nueva contraseña (mínimo 8 caracteres)" minLength={8} maxLength={72} value={claveNueva} onChange={(e) => setClaveNueva(e.target.value)} />
            </div>
            <label className="auth-toggle">
              <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} />
              Mostrar contraseña
            </label>
            <button className="auth-submit primary" type="submit">Guardar contraseña</button>
            <button className="auth-submit secondary" type="button" onClick={onMostrarIngreso}>Volver al login</button>
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        ) : (
          <form className="auth-card" onSubmit={iniciarSesion}>
            {/* Formulario de LOGIN: mail + contraseña → iniciarSesion
                (App.jsx hace POST /login con Basic Auth y guarda el token). */}
            <div className="auth-card-head"><div><h2>Entrá a tu cuenta</h2></div><p>Reservá y administrá tus turnos desde una sola pantalla.</p></div>
            <div className="auth-fields">
              <input type="text" placeholder="Mail" value={correoIngreso} onChange={(e) => setCorreoIngreso(e.target.value)} />
              {/* type cambia según verClave: 'password' oculta, 'text' muestra. */}
              <input type={verClave ? 'text' : 'password'} placeholder="Contraseña" value={claveIngreso} onChange={(e) => setClaveIngreso(e.target.value)} />
            </div>
            {/* Checkbox que alterna verClave para mostrar la contraseña. */}
            <label className="auth-toggle">
              <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} />
              Mostrar contraseña
            </label>
            {/* Link a la pantalla de recuperación (manda el link por mail). */}
            <button className="auth-link" type="button" onClick={onMostrarRecuperar}>¿Olvidaste tu contraseña?</button>
            <button className="auth-submit primary" type="submit">Iniciar sesión</button>
            <button className="auth-submit secondary" type="button" onClick={onMostrarRegistro}>Registrarme</button>
            <span className="auth-divider">o</span>
            {/* Botón de Google (MOCK): no usa OAuth real; crea un usuario
                falso con token 'mock-google' que no puede reservar turnos. */}
            <button className="auth-submit google" type="button" onClick={ingresarConGoogle}>
              {/* Logo de Google en SVG (decorativo, aria-hidden). */}
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
              </svg>
              Continuar con Google
            </button>
            {/* Mensaje de éxito/error del login (viene de App.jsx). */}
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        )}
      </section>
      <PieDePagina />
    </main>
  );
}
export default IniciarSesion;