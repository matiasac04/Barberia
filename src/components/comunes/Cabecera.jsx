// ── Cabecera con logo y nombre de la barbería ─────────
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
