// ═══════════════════════════════════════════════════════════════════
// PANTALLA DE INICIO DE SESIÓN / REGISTRO
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es la única pantalla visible cuando NO hay sesión activa (App.jsx lo
// detecta: sin token o sin currentUser). Contiene DOS formularios en la
// misma pantalla, elegidos por pantallaAcceso:
//
//   'ingreso'  → usuario/mail + contraseña → POST /login (Basic Auth)
//   'registro' → nombre, apellido, mail, contraseña, whatsapp → POST /registro
//
// Al elegir 'registro' se muestra el formulario de alta; al elegir 'ingreso',
// el de entrada. onMostrarRegistro/onMostrarIngreso cambian pantallaAcceso
// en App.jsx.
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
function IniciarSesion({ pantallaAcceso, avisoAcceso, iniciarSesion, crearCuenta, ingresarConGoogle, correoIngreso, claveIngreso, onMostrarIngreso, onMostrarRegistro, formularioRegistro, setCorreoIngreso, setClaveIngreso, setFormularioRegistro }) {
  const esRegistro = pantallaAcceso === 'registro';
  const [verClave, setVerClave] = useState(false);
  // ── Render de ingreso o registro ────────────────────
  return (
    <main className="simple-page auth-page">
      <section className="simple-hero auth-shell">
        <div className="auth-copy">
          <a className="brand-lockup" href="/" onClick={(e) => e.preventDefault()}>
            <span className="brand-mark" aria-hidden="true">
              <img src={logoTijera} alt="" width="30" height="30" />
            </span>
            <span className="brand-text"><strong>Barberia</strong><small>Qué cortecito</small></span>
          </a>
          <span className="simple-tag">Agendá online</span>
          <h1>{esRegistro ? 'Creá tu cuenta' : 'Iniciá sesión'}</h1>
          <p>{esRegistro ? 'Completá tus datos para registrarte y después entrar al sistema de turnos.' : 'Accedé con tu mail y contraseña para entrar al sistema de turnos.'}</p>
          <ul className="auth-features">
            <li>Reservá tu turno online en menos de un minuto</li>
            <li>Elegí tu profesional y el servicio que quieras</li>
            <li>Cancelá con 24 h de anticipación sin costo</li>
          </ul>
        </div>
        {esRegistro ? (
          <form className="auth-card" onSubmit={crearCuenta}>
            <div className="auth-card-head"><div><h2>Crear cuenta</h2></div><p>Te pedimos los datos justos para dejar tu perfil listo.</p></div>
            <div className="auth-fields register-fields">
              <input type="text" placeholder="Nombre" value={formularioRegistro.nombre} onChange={(e) => setFormularioRegistro((p) => ({ ...p, nombre: e.target.value }))} />
              <input type="text" placeholder="Apellido" value={formularioRegistro.apellido} onChange={(e) => setFormularioRegistro((p) => ({ ...p, apellido: e.target.value }))} />
              <input type="email" placeholder="Mail" value={formularioRegistro.email} onChange={(e) => setFormularioRegistro((p) => ({ ...p, email: e.target.value }))} />
              <input type="password" placeholder="Contraseña (mínimo 8 caracteres)" minLength={8} maxLength={72} value={formularioRegistro.password} onChange={(e) => setFormularioRegistro((p) => ({ ...p, password: e.target.value }))} />
              <input type="tel" placeholder="WhatsApp" value={formularioRegistro.telefono} onChange={(e) => setFormularioRegistro((p) => ({ ...p, telefono: e.target.value }))} />
            </div>
            <button className="auth-submit primary" type="submit">Crear cuenta</button>
            <button className="auth-submit secondary" type="button" onClick={onMostrarIngreso}>Volver atrás</button>
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        ) : (
          <form className="auth-card" onSubmit={iniciarSesion}>
            <div className="auth-card-head"><div><h2>Entrá a tu cuenta</h2></div><p>Reservá y administrá tus turnos desde una sola pantalla.</p></div>
            <div className="auth-fields">
              <input type="text" placeholder="Usuario o mail" value={correoIngreso} onChange={(e) => setCorreoIngreso(e.target.value)} />
              <input type={verClave ? 'text' : 'password'} placeholder="Contraseña" value={claveIngreso} onChange={(e) => setClaveIngreso(e.target.value)} />
            </div>
            <label className="auth-toggle">
              <input type="checkbox" checked={verClave} onChange={(e) => setVerClave(e.target.checked)} />
              Mostrar contraseña
            </label>
            <button className="auth-submit primary" type="submit">Iniciar sesión</button>
            <button className="auth-submit secondary" type="button" onClick={onMostrarRegistro}>Registrarme</button>
            <span className="auth-divider">o</span>
            <button className="auth-submit google" type="button" onClick={ingresarConGoogle}>
              <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.76h3.56c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.56-2.76c-.98.66-2.23 1.06-3.72 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15A11 11 0 0 0 2.18 7.05l3.66 2.84c.87-2.6 3.3-4.51 6.16-4.51z" />
              </svg>
              Continuar con Google
            </button>
            <div className={`simple-feedback ${avisoAcceso.type}`}>{avisoAcceso.message}</div>
          </form>
        )}
      </section>
      <PieDePagina />
    </main>
  );
}
export default IniciarSesion;