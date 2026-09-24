// ── Configuración de la conexión ──────────────────────
// Este archivo se encarga de la CONEXIÓN con la base de datos SQL Server.
// Las rutas del backend no conectan a la base por su cuenta: TODAS llaman
// a getPool() (que exportamos al final) y reciben de acá la conexión lista.
//
// ¿Por qué un "pool"? Porque abrir una conexión a la DB es lento. En vez de
// conectar y desconectar en cada consulta, abrimos UNA sola conexión una vez
// y la reutilizamos para todos los pedidos. "Pool" = grupo de conexiones
// reutilizables (acá, en la práctica, una única conexión compartida).
//
// ¿Dónde están las credenciales? NO están hardcodeadas acá (nunca hay que
// poner la clave de la DB en el código, sobre todo si el repo es público).
// Vienen de server/.env, que dotenv carga al hacer require('dotenv')...
require('dotenv').config();

const sql = require('mssql');

// Datos de conexión leídos desde server/.env:
//   usuario_bd, psw_bd, servido_bd (el servidor), nombre_bd (la base).
// La base está en la nube (SQL Server en Somee), no local.
const config = {
    user: process.env.usuario_bd,
    password: process.env.psw_bd,
    server: process.env.servido_bd,
    database: process.env.nombre_bd,        
    options: {
        encrypt: true,                // cifra la conexión (obligatorio en la nube)
        trustServerCertificate: true  // confía en el certificado (Somee no da uno firmado)
    },
    port: 1433                        // puerto estándar de SQL Server
};

// ── Pool de conexiones ────────────────────────────────
// pool          → la conexión reutilizable (la creamos la primera vez)
// lastPoolCheck → timestamp (ms) de la última vez que chequeamos que la
//                 conexión sigue viva. Arranca en 0 = "nunca" → fuerza
//                 el primer chequeo.
// POOL_PING_INTERVAL → cada CUÁNTO chequeamos. 5000 ms = cada 5 segundos.
//
// ¿Qué es el "ping"? Un chequeo de "¿seguís ahí?" a la base. Las bases en
// la nube (sobre todo gratis, como Somee) CORTAN las conexiones que quedan
// inactivas. Si la nuestra se muere sin avisar, el pool queda "podrido" y
// cada consulta fallaría. El ping detecta eso y CREA UNA CONEXIÓN NUEVA
// automáticamente, sin reiniciar el servidor.
let pool; 
let lastPoolCheck = 0;
const POOL_PING_INTERVAL = 5000;

// getPool() devuelve una conexión lista para usar (la crea o la renueva si hace falta).
// Todos los routers hacen: const { getPool } = require('../conexion'); y usan esto.
async function getPool() {
    // 1) Si ya tenemos pool y lo chequeamos hace menos de 5 segundos →
    //    lo devolvemos DIRECTO, sin preguntar nada (rápido, ahorra llamadas).
    if (pool && Date.now() - lastPoolCheck < POOL_PING_INTERVAL) {
        return pool;
    }

    // 2) Pasaron 5 segundos y ya teníamos pool → pregunto "¿seguís ahí?".
    if (pool) {
        try {
            // "SELECT 1" = el ping: la base solo responde "1", no trae datos.
            // Si responde, la conexión está viva → renovamos el timestamp.
            await pool.request().query("SELECT 1");
            lastPoolCheck = Date.now();
            return pool;
        } catch {
            // No respondió → el pool está MUERTO. Lo cerramos (por las dudas)
            // y lo marcamos como undefined para que se cree uno nuevo abajo.
            try { await pool.close(); } catch {}
            pool = undefined;
        }
    }

    // 3) No hay pool (primera vez) o quedó inválido → conectamos de nuevo.
    try {
      pool = await sql.connect(config);
    } catch (err) {
      console.error("Error al conectar a la base de datos: ", err);
      throw err;  // si no se puede conectar, no hay nada que hacer
    }
    lastPoolCheck = Date.now();
    console.log("¡Conectado exitosamente al SQL Server de mi Windows!");
    return pool;
}

// Exportamos el módulo mssql (lo usan las rutas para transacciones y tipos)
// y getPool (para obtener la conexión lista).
module.exports = { sql, getPool };