// ═══════════════════════════════════════════════════════════════════
// vite.config.js — CONFIGURACIÓN DE VITE (el empaquetador/build)
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Vite es la herramienta que corre `npm run dev` (servidor de desarrollo con
// recarga en vivo) y `npm run build` (genera la carpeta dist/ optimizada).
// Este archivo le dice QUÉ plugins usar.
//
// - defineConfig(...)  → helper que da autocompletado y tipos en el editor.
// - plugins: [react()] → habilita el plugin de React, que transforma el JSX
//   (la sintaxis <Componente />) en JavaScript que el navegador entiende, y
//   activa el Fast Refresh (guardar un archivo y ver el cambio al instante
//   sin perder el estado de la app).
//
// OJO: acá NO va la URL del backend. El frontend apunta a http://localhost:3000
// desde src/servicios/consultas.js. Lo único configurable por entorno es VITE_API_URL,
// que consultas.js lee con import.meta.env (ver ese archivo).
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
})
