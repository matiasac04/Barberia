// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   Cabecera()             → L25
//   render (JSX)           → L26
// ═══════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════
// CABECERA — logo y nombre de la barbería (componente compartido)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Barra superior que se repite en TODAS las pantallas (login, turnero,
// mis turnos, panel admin). Solo muestra identidad visual: logo + nombre
// + un subtítulo que cambia según la pantalla.
//
//   <Cabecera />                    → subtítulo por defecto "Qué cortecito"
//   <Cabecera subtitle="Mis turnos" /> → texto contextual
//
// No tiene estado ni lógica: es puramente presentacional. El <a href="/">
// tiene preventDefault para que el logo NO recargue la app (la SPA ya
// gestiona la navegación). El ícono es decorativo: aria-hidden + alt="".
// Importa el SVG del logo (Vite lo convierte en una URL al hacer build).
import logoTijera from '../../assets/logo-tijera.svg'
// Recibe un prop opcional subtitle; si no se pasa, usa "Qué cortecito".
function Cabecera({ subtitle = 'Qué cortecito' }) {
  return (
    <header className="brand-bar">
      {/* href="/" mantiene la semántica de enlace, pero preventDefault
          evita la recarga: la SPA ya maneja la navegación internamente. */}
      <a className="brand-lockup" href="/" onClick={(e) => e.preventDefault()}>
        {/* aria-hidden: el lector de pantalla lo omite porque el texto
            del <span> siguiente ya describe la marca. */}
        <span className="brand-mark" aria-hidden="true">
          {/* alt="" vacío: también es decorativo (la marca está en texto). */}
          <img src={logoTijera} alt="" width="26" height="26" />
        </span>
        {/* Nombre visible: "Barberia" + subtítulo contextual de la pantalla. */}
        <span className="brand-text"><strong>Barberia</strong><small>{subtitle}</small></span>
      </a>
    </header>
  )
}
export default Cabecera
