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
import logoTijera from '../../assets/logo-tijera.svg'
function Cabecera({ subtitle = 'Qué cortecito' }) {
  return (
    <header className="brand-bar">
      <a className="brand-lockup" href="/" onClick={(e) => e.preventDefault()}>
        <span className="brand-mark" aria-hidden="true">
          <img src={logoTijera} alt="" width="26" height="26" />
        </span>
        <span className="brand-text"><strong>Barberia</strong><small>{subtitle}</small></span>
      </a>
    </header>
  )
}
export default Cabecera
