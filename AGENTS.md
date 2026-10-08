# AGENTS.md

## Overview
Spa de barbería (reservas de turnos) en React 19 + Vite 8, sin TypeScript, con backend Node/Express + SQL Server.

- **Frontend**: React + Vite en `src/`, estado en `src/App.jsx`, UI en español rioplatense.
- **Backend**: servidor Express en `server/` (CommonJS), conectado a SQL Server vía `mssql`. No hay ORM: queries SQL directas con `.input()`/`.query()`.
- **Persistencia**: los datos viven en SQL Server. El frontend igualmente usa `localStorage` para el token y el usuario actual (beneficio de UI, se pierde si cambia de navegador).

## Commands
- Frontend (`package.json` raíz): `npm run dev`, `npm run build` (`dist/`), `npm run lint` (**oxlint**, config `.oxlintrc.json`), `npm run preview`.
- Backend (`server/package.json`): `npm start` (node), `npm run dev` (nodemon). Requiere SQL Server levantado y `.env` con las credenciales.
- No hay tests ni script de test.

## Arquitectura / flujo
- El frontend llama a `src/servicios/consultas.js` (helper `peticion()`), que hace `fetch` a `http://localhost:3000`.
- El server (`server/index.js`) monta las rutas JWT-protected (registrar/login, turnos, profesionales, servicios, horarios y bloqueos) desde `server/rutas/`.
- Auth: JWT firmado en `server/autenticacion.js`, secret en `server/.env` (`JWT_SECRET`).
- `currentUser.role` en `App.jsx` decide si se renderiza `Admin` o el turnero del cliente.

## Reglas de dominio
- Domingos y lunes cerrados (`esDiaCerrado`), ventana de reservas: hoy + 30 días (App.jsx:11-15).
- Horarios fijos en `horariosFijos` (src/datos/semilla.js): de 09:00–12:00 y 15:00–17:00 (con break de almuerzo). Activos si no hay `HorarioLaboral` en la DB.
- Disponibilidad = `horariosFijos` menos bloqueos + horarios ya reservados (App.jsx:75-85).
- Las cancelaciones solo se permiten con >24 h de antelación (`sePuedeCancelar`, src/utilidades/funciones.js:62).

## Fuentes de verdad del estado
- Horario fijo de respaldo: `src/datos/semilla.js` (`horariosFijos`). Son fallback de arranque; la DB es la fuente real.
- Lógica de fechas/agenda: `src/utilidades/funciones.js`.
- Estado global y flujo de pantallas (`cliente` / `admin` / `mis-turnos`): `src/App.jsx`.
- `crypto.randomUUID()` para IDs, `structuredClone()` para copias de estado.

## Convenciones
- Componentes en `src/components/` agrupados por función, función + `export default`, sin prop-drilling types. Nombres cortos y descriptivos (ej. `Home`, `Login`, `Calendar`, `Header`, `Admin`, `Agenda`).
  - `components/comunes/` → `Cabecera`, `PieDePagina`, `WhatsApp`.
  - `components/ingreso/` → `IniciarSesion`.
  - `components/cliente/` → `Inicio`, `Calendario`, `MisTurnos`.
  - `components/admin/` → `Admin` + los paneles (`Resumen`, `Profesionales`, `Servicios`, `Horarios`, `Turnos`, `Agenda`).
- UI en español rioplatense con voseo ("iniciá", "elegí", "completá"): mantener ese registro en textos nuevos.
- Precios en ARS formateados con `toLocaleString('es-AR')`; fechas con `Intl.DateTimeFormat('es-AR')`.
- Los imports de componentes usan extensiones mezcladas (`.jsx` a veces, a veces no); Vite los resuelve igual.
- React Compiler no está habilitado; React StrictMode activo en `main.jsx`.

## Entorno
- Node `^20.19.0 || >=22.12.0` (requisito de Vite 8).
- `server/.gitignore` cubre `node_modules`, `.env` y `*.log`. `dist/` y `node_modules/` en `.gitignore` raíz. Es repo git; el remoto es https://github.com/matiasac04/Barberia.git (rama `main`).
- No commitear `server/.env` (credenciales reales de la DB y del JWT).

## Reglas del asistente
- Nunca editar archivos ni ejecutar cambios sin pedir permiso al usuario primero.
- Siempre explicar qué se va a hacer y esperar el ok antes de proceder.

## Git / entorno (importante)
- El repo `Barberia` en GitHub se subió con force push y estructura corregida: la raíz del repo es el frontend (`index.html`, `package.json`, `vite.config.js`, `src/`, `server/`, `BD/`). NO anidado dentro de subcarpetas. Es la estructura definitiva; no reestructurar.
- Trabajar y hacer git siempre desde la raíz del repo clonado. Si git no está en el PATH de la terminal, usar la ruta completa del instalador.
- Cualquier integrante del equipo: clonar con `git clone https://github.com/matiasac04/Barberia.git`. NO hacer `pull`/`push` de historiales viejos ni `push --force` (pisaría la estructura correcta). Si aparece "unrelated histories", resolver con `git fetch origin` + `git reset --hard origin/main`, o re-clonar.

## Deploy (en proceso)
- Objetivo: todo en **Vercel** (plan Hobby, gratis), con **2 proyectos** del mismo repo de GitHub (`matiasac04/Barberia`) conectados vía Git: cada push a `main` despliega ambos. (Se descartó Belmo/Koyeb/Render/Northflank.)
- **Proyecto frontend**: root directory vacío (raíz del repo). Vite se detecta solo (build `vite build`, output `dist/`). Env `VITE_API_URL` = URL del proyecto backend (sin barra final), en Production y Preview (se inyecta en el build).
- **Proyecto backend**: root directory `server`. Express se detecta zero-config (entry `index.js` con `app.listen` + `module.exports = app`). Sin build command. Env en el dashboard, NO en el repo: `usuario_bd`, `psw_bd`, `servidor_bd`, `nombre_bd`, `JWT_SECRET`. Región de funciones cercana al SQL de Somee.
- La DB es externa (SQL Server en Somee, credenciales en `server/.env`, fuera del repo), así que el deploy no afecta datos.
- Verificación: `GET https://<api>.vercel.app/servicios` devuelve JSON; después probar end-to-end login, turnos y panel admin.
