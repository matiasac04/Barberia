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
- `server/.gitignore` cubre `node_modules`, `.env` y `*.log`. `dist/` y `node_modules/` en `.gitignore` raíz; no es repo git (aún).
- No commitear `server/.env` (credenciales reales de la DB y del JWT).

## Reglas del asistente
- Nunca editar archivos ni ejecutar cambios sin pedir permiso al usuario primero.
- Siempre explicar qué se va a hacer y esperar el ok antes de proceder.
