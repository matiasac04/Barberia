# Resumen del proyecto: "Qué cortecito" — Turnero de barbería

## 1. ¿Qué es?
Una **aplicación web para reservar turnos de barbería online**. Tiene dos tipos de usuario:
- **Cliente**: se registra, elige profesional, servicio, día y horario, y reserva. Puede ver, cancelar o reprogramar sus turnos.
- **Administrador**: gestiona profesionales, servicios, horarios de atención, bloqueos y toda la agenda del local.

Es una **SPA** (Single Page Application) con un **backend propio** y **base de datos SQL Server** en la nube.

---

## 2. Tecnologías que utiliza

| Capa | Tecnología | Detalle |
|---|---|---|
| **Frontend** | **JavaScript (ESM) + React 19** | Sin TypeScript, JSX |
| Build/dev | **Vite 8** (+ `@vitejs/plugin-react`) | dev server, `vite build` |
| Linter | **oxlint** | config `.oxlintrc.json` |
| **Backend** | **Node.js + Express 5** | CommonJS (`require`) |
| Base de datos | **SQL Server** (`mssql` / tedious) | alojada en Somee (nube) |
| Auth | **JWT** (`jsonwebtoken`) + **bcryptjs** | token 1 h, hash de contraseñas |
| Seguridad | **helmet**, **cors**, **express-rate-limit** | ver sección 7 |
| Mails | **nodemailer** (Gmail) | mail de confirmación de turno |
| Config | **dotenv** | credenciales en `server/.env` |
| Deploy | **Vercel** (Hobby) | 2 proyectos, frontend + backend |

---

## 3. Cómo funciona (flujo de datos)

```
UI (React) → App.jsx (estado + handlers)
   → src/servicios/api.js (fetch / peticion)
   → Backend Express (server/index.js + rutas)
   → SQL Server (BD)
   ← respuesta JSON que vuelve y actualiza el estado ← re-render
```

- El frontend **no usa Redux ni Context**: todo el estado global vive en `App.jsx` y baja por **props (prop-drilling)**. `currentUser.role` decide qué pantalla se renderiza (`admin` o `cliente`).
- El backend expone una **API REST**; ninguna ruta abre conexiones: todas usan `getPool()` (un pool único con ping cada 5 s para sobrevivir a los cortes de hosting gratis).

---

## 4. Ubicación de cada cosa (estructura)

```
mi-barberia/
├─ index.html            # Único HTML; solo <div id="root">
├─ vite.config.js        # Config de Vite (plugin React)
├─ package.json          # Scripts del frontend
├─ .env                  # Variables Vite (VITE_API_URL)
├─ src/
│  ├─ main.jsx           # Punto de entrada; monta React en #root
│  ├─ App.jsx            # EL CEREBRO: estado global + flujo de pantallas + handlers + llamadas API (731 líneas)
│  ├─ App.css / index.css
│  ├─ datos/semilla.js           # Horarios fijos de respaldo (09-12 y 15-17)
│  ├─ servicios/api.js           # Capa única de fetch al backend
│  ├─ utilidades/funciones.js    # Lógica pura de fechas/horarios/disponibilidad
│  └─ components/
│     ├─ comunes/   → Cabecera, PieDePagina, WhatsApp
│     ├─ ingreso/   → IniciarSesion (login + registro)
│     ├─ cliente/   → Inicio (turnero), Calendario, MisTurnos
│     └─ admin/     → Admin + Resumen, Profesionales, Servicios, Horarios, Turnos, Agenda, FiltrosTurnos
├─ server/               # Backend Express (CommonJS)
│  ├─ index.js           # Entrada: middlewares + monta rutas + 404/500
│  ├─ conexion.js        # Pool de conexión a SQL Server (único acceso a BD)
│  ├─ autenticacion.js   # Middlewares jwtMiddleware + requireAdmin
│  ├─ validaciones.js    # Validación de fecha/hora/password/id
│  ├─ mailer.js          # Envío de mail de confirmación (Gmail)
│  ├─ .env               # Credenciales DB + JWT_SECRET + Gmail (NO en el repo)
│  └─ rutas/
│     ├─ rutasSesion.js         # /registro, /login, /verificar
│     ├─ rutasClientes.js       # /clientes/:id/turnos
│     ├─ rutasTurnos.js         # disponibilidad, reservar, cancelar, editar (el más grande)
│     ├─ rutasProfesionales.js  # CRUD profesionales + horarios + bloqueos
│     └─ rutasServicios.js      # CRUD servicios
└─ BD/
   ├─ TurnosBarberia.sql         # Esquema de la base
   └─ turnosbarberia.somee.sql   # script de la BD en Somee
```

---

## 5. Modelo de datos (tablas SQL Server)

| Tabla | Contiene |
|---|---|
| **Cliente** | clientes registrados (email único, password hasheado) |
| **Administrador** | el/los admin (login por `usuario`, no email) |
| **Profesional** | barberos (`activo` = baja lógica) |
| **Servicio** | catálogo (nombre, precio, duración) |
| **HorarioLaboral** | franjas por profesional y día de la semana |
| **Turno** | la reserva (fecha, horaInicio, `horaFin` **calculada**, precio, estado) |
| **BloqueoHorario** | bloqueos del admin (`hora = NULL` → día completo) |

`Turno.estado` usa 4 valores en español: `Confirmado`, `Completado`, `NoSePresento`, `Cancelado` (cancelar **no borra**, libera el horario).

---

## 6. Reglas de negocio clave

- **Domingo y lunes cerrado** (`esDiaCerrado`).
- **Ventana de reservas**: desde hoy hasta **hoy + 30 días**.
- **Turnos de 30 minutos**; la barbería atiende de **09:00-12:00 y 15:00-17:00** (almuerzo sin turnos).
- **Disponibilidad** = horario del profesional − (turnos ocupados + bloqueos + horarios de hoy ya pasados).
- **Cancelar/reprogramar** solo con **> 24 h** de antelación.
- Reglas validadas **en el frontend Y en el backend** (para que no se salteen llamando la API a mano).
- **Anti doble-reserva**: chequeo de ocupación + INSERT dentro de una **transacción SQL `SERIALIZABLE`** (evita que dos clientes tomen el mismo horario a la vez).
- **Horario de respaldo**: si un profesional no tiene `HorarioLaboral` cargado, se usan los horarios de `semilla.js`.

---

## 7. Seguridad (puntos fuertes)

- **JWT** firmado en el backend, expira en 1 h; va en `Authorization: Bearer`.
- **Dos middlewares**: `jwtMiddleware` (¿quién sos?) + `requireAdmin` (¿sos admin?).
- **bcrypt** con migración automática de contraseñas viejas en texto plano.
- **Rate limiting**: 300 req/15 min global, y **20 req/15 min solo en `/login` y `/registro`** (anti fuerza bruta).
- **helmet** (cabeceras) y **cors**.
- **Validación de entrada** centralizada: evita que un input raro provoque un 500.
- La respuesta de login **nunca devuelve el hash** de la contraseña.
- Credenciales **fuera del repo** (`server/.env`).

---

## 8. Detalles interesantes

- **Problema real resuelto - zona horaria**: SQL Server devuelve fechas/horas que "corrían" un día por el UTC. Se soluciona con `CONVERT(..., 23)` (fechas) y `CONVERT(varchar(5), ..., 108)` (horas) en todas las consultas.
- **Problema real resuelto - pool de conexiones**: la base en la nube tarda ~2,4 s en conectar y corta conexiones inactivas; se resuelve con pool + ping cada 5 s + promesa compartida (`reconociendo`) para que 6 requests paralelos usen **una sola** conexión.
- **Carga inicial en paralelo** con `Promise.allSettled` (si una request falla, las demás igual cargan) y botón de **Reintentar**.
- **Auto-refresco** de "Mis turnos" cada 20 s y al volver a la pestaña.
- **Login con Google**: hay un **mock** (rama `respaldo-google`), falta configurar `GOOGLE_CLIENT_ID`.
- **Deploy**: frontend y backend en Vercel conectados por Git; cada push a `main` despliega ambos. Repo **público** a propósito (plan Hobby).

---

## 9. Cómo correrlo

```powershell
# Frontend (raíz)
npm install; npm run dev        # http://localhost:5173

# Backend (otra terminal)
cd server; npm install; npm start   # http://localhost:3000
```
Requiere SQL Server accesible y `server/.env` con las credenciales. `npm run lint` corre oxlint; no hay tests.

**En una frase**: es un turnero full-stack hecho con React + Vite en el front, Express + SQL Server en el back, con autenticación JWT por roles, validaciones de negocio duplicadas en cliente y servidor, y despliegue gratuito en Vercel.
