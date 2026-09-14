function Cabecera({ subtitle = 'Qué cortecito' }) {
  return (
    <header className="brand-bar">
      <a className="brand-lockup" href="/" onClick={(e) => e.preventDefault()}>
        <span className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="6" cy="6" r="2.6" /><circle cx="6" cy="18" r="2.6" /><path d="M8.5 7.9 21 18.4M8.5 16.1 21 5.6M13.6 12h1.6" />
          </svg>
        </span>
        <span className="brand-text"><strong>Barberia</strong><small>{subtitle}</small></span>
      </a>
    </header>
  )
}
export default Cabecera
