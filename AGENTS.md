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
- El frontend llama a `src/servicios/api.js` (helper `peticion()`), que hace `fetch` a `http://localhost:3000`.
- El server (`server/index.js`) monta las rutas JWT-protected (registrar/login, turnos, profesionales, servicios, horarios y bloqueos) desde `server/rutas/`.
- Auth: JWT firmado en `server/autenticacion.js`, secret en `server/.env` (`JWT_SECRET`).
- `currentUser.role` en `App.jsx` decide si se renderiza `Admin` o el turnero del cliente.

## Reglas de dominio
- Domingos y lunes cerrados (`isBlockedWeekday`), ventana de reservas: hoy + 30 días (App.jsx:11-15).
- Horarios fijos en `timeSlots` (src/datos/semilla.js): de 09:00–12:00 y 15:00–17:00 (con break de almuerzo). Activos si no hay `HorarioLaboral` en la DB.
- Disponibilidad = `timeSlots` menos bloqueos + horarios ya reservados (App.jsx:75-85).
- Las cancelaciones solo se permiten con >24 h de antelación (`canCancelBooking`, src/utilidades/ayudantes.js:62).

## Fuentes de verdad del estado
- Datos seed: `src/datos/semilla.js` (`barbers`, `services`, `timeSlots`, `initialTakenSlots`). Son fallback de arranque; la DB es la fuente real.
- Lógica de fechas/agenda: `src/utilidades/ayudantes.js`.
- Estado global y flujo de pantallas (`client` / `admin` / `my-bookings`): `src/App.jsx`.
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
- Objetivo: publicación gratuita = frontend en **Vercel** + backend en **Belmo** (dashboard.belmo.io) porque Koyeb ya no tiene tier gratis (fue absorbida por Mistral) y Render duerme (cold start). Northflank pide tarjeta. Oracle Cloud es la alternativa robusta si Belmo no alcanza.
- Repo ya subido y estructurado: falta conectar Belmo (backend, root dir `server`, build `npm install`, run `npm start`, env vars en el panel, NO en el repo) y Vercel (frontend, env `VITE_API_URL` apuntando a la URL de Belmo).
- La DB es externa (SQL Server en Somee, credenciales en `.env` del server, fuera del repo), así que el deploy no afecta datos.
