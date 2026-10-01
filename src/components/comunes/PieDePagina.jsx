// ═══════════════════════════════════════════════════════════════════
// PIE DE PÁGINA — copyright (componente compartido)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Pie de página que se renderiza en todas las pantallas. No recibe props ni
// tiene estado: es el componente más simple del proyecto.
// Usa new Date().getFullYear() para que el año se actualice solo al cambiar
// el año, sin necesidad de editarlo a mano.
function PieDePagina() {
  return <footer className="simple-footer"><p>© {new Date().getFullYear()} Barberia · Qué cortecito</p></footer>
}
export default PieDePagina
