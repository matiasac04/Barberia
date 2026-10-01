// ═══════════════════════════════════════════════════════════════════
// main.jsx — PUNTO DE ENTRADA DE REACT
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Es el primer archivo que ejecuta el navegador (lo apunta el <script> en
// index.html). Hace exactamente tres cosas:
//
// 1. Importa index.css → los estilos globales (reset + variables de color).
// 2. Importa App → el componente raíz con TODO el estado de la app.
// 3. createRoot(...).render(<App />) → monta la app dentro del <div id="root">
//    que está en index.html.
//
// QUÉ ES createRoot: es la API moderna de React 18+ para montar la app.
// Recibe el nodo del DOM donde se va a renderizar y, con .render(), le dice
// "acá vive mi aplicación".
//
// QUÉ ES StrictMode: un modo de desarrollo que React usa para detectar errores
// comunes (efectos que se ejecutan dos veces a propósito para verificar la
// limpieza, mutaciones accidentales, etc.). NO afecta producción: en el build
// final React lo elimina solo. Importante: en desarrollo los useEffect se
// disparan DOS veces, y por eso el código usa flags como `cancelado` para no
// setear el estado con respuestas viejas (ver los useEffect de App.jsx).
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
