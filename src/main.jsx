// ═══════════════════════════════════════════════════════════════════
// ÍNDICE DEL ARCHIVO — funciones y secciones (línea exacta)
// ═══════════════════════════════════════════════════════════════════
//   imports                    → L39
//   createRoot/render          → L47
// ═══════════════════════════════════════════════════════════════════

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
// El orden de los imports importa: index.css se carga ANTES que App.jsx (y por
// lo tanto antes que App.css), así que App.css puede pisar reglas base si
// definisen algo en común. En Vite el CSS se inyecta en el <head> en orden.
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* StrictMode envuelve la app entera: en desarrollo hace correr los
        efectos dos veces para detectar limpiezas faltantes (por eso los
        useEffect de App.jsx usan flags como `cancelado`). */}
    <App />
  </StrictMode>,
)
