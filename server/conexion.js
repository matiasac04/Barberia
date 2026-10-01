// ═══════════════════════════════════════════════════════════════════
// server/conexion.js — GESTIÓN DE LA CONEXIÓN A SQL SERVER
// ═══════════════════════════════════════════════════════════════════
// ¿CÓMO FUNCIONA?
//
// Este archivo es el ÚNICO que habla con la base de datos. Ninguna ruta
// abre conexiones por su cuenta: todas llaman a getPool() y reciben la
// conexión ya lista.
//
// EL PROBLEMA QUE RESUELVE (y por qué es tan defensivo):
// La base está en la nube (SQL Server en Somee, plan gratuito), no local.
// Eso trae dos problemas reales:
//
// 1. ABRIR UNA CONEXIÓN ES LENTA (~2,4 s medidos: DNS + TLS + login).
//    Si cada request abriera y cerrara su propia conexión, cada click del
//    usuario pagaría esa demora. Solución: un POOL (conexión única
//    compartida) que se abre UNA vez y se reutiliza para todas las consultas.
//
// 2. LOS HOSTING GRATUITOS CORTAN LAS CONEXIONES INACTIVAS.
//    Si nuestra conexión queda quieta un rato, el hosting la mata sin avisar
//    y el pool queda "podrido": todas las consultas siguientes fallarían.
//    Solución: un PING cada 5 s. Si la conexión no responde, se cierra y se
//    crea una nueva automáticamente, sin reiniciar el servidor.
//
// EL PING Y EL "RECONOCIENDO":
// - getPool() tiene 3 caminos:
//     1) pool existe y se chequeó hace < 5 s → lo devuelve directo (rápido)
//     2) toca pingear o conectar → arranca (o se engancha a) un ciclo
//     3) devuelve la conexión (vieja o la que se está abriendo)
//
// - `reconociendo` es la promesa del ciclo que está ABRÍENDOSE ahora.
//   Existe para que N requests simultáneos (la carga inicial dispara 6 en
//   paralelo) NO abran N conexiones: el primero abre la suya y los demás
//   esperan a ESA MISMA promesa. Sin esto, `pool` queda undefined hasta que
//   el await termina, y cada llamada concurrente se salta el caso 1 y se
//   va a su propio sql.connect() → 6 conexiones y 5 fugas (Somee tiene
//   pocos slots). Con esto: 1 conexión.
//   OJO: esto NO reduce la latencia del primer request (medido: 2,6 s igual
//   en ambos casos) — el costo está en abrir la conexión contra la nube.
//
// require('dotenv').config() lee server/.env para que las credenciales
// estén en process.env y NO hardcodeadas en el código.
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
// reconociendo → la promesa de la conexión que se está ABRIENDO ahora mismo.
// Existe para que N pedidos que llegan juntos (la carga inicial de la app
// dispara 6 requests en paralelo) NO abran 6 conexiones: el primero abre la
// suya y los demás esperan a esa MISMA promesa. Sin esto, `pool` sigue
// undefined hasta que el await termina, y cada llamada concurrente se saltaba
// los dos casos de arriba y terminaba en su propio sql.connect().
// Las conexiones perdedoras nunca se cerraban (Somee, al ser gratis, tiene
// muy pocos slots y los sharing los apuran), así que además se fugaban
// conexiones en cada montaje. Antes: 6 conexiones en el primer arranque,
// ahora: 1. OJO: esto NO reduce la latencia del primer request (medido: 2,6 s
// igual en ambos casos) — el costo está en abrir la conexión contra la nube.
let reconociendo = null;

// getPool() devuelve una conexión lista para usar (la crea o la renueva si hace falta).
// Todos los routers hacen: const { getPool } = require('../conexion'); y usan esto.
async function getPool() {
    // 1) Si ya tenemos pool y lo chequeamos hace menos de 5 segundos →
    //    lo devolvemos DIRECTO, sin preguntar nada (rápido, ahorra llamadas).
    if (pool && Date.now() - lastPoolCheck < POOL_PING_INTERVAL) {
        return pool;
    }

    // 2) Hay que pingear o conectar. Si ya hay una conexión abriéndose, nos
    //    enganchamos a esa (case 2 y 3 Shared). Si no, arrancamos el cycle.
    if (!reconociendo) {
        reconociendo = (async () => {
            // 2a) Pasaron 5 segundos y ya teníamos pool → "¿seguís ahí?".
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

            // 2b) No hay pool (primera vez) o quedó inválido → conectamos de nuevo.
            try {
                pool = await sql.connect(config);
            } catch (err) {
                console.error("Error al conectar a la base de datos: ", err);
                throw err;  // si no se puede conectar, no hay nada que hacer
            }
            lastPoolCheck = Date.now();
            console.log("¡Conectado exitosamente al SQL Server de la nube!");
            return pool;
        })().finally(() => {
            // Libera el lock: el próximo pedido que necesite pool puede
            // arrancar su propio cycle (y si este falló, puede reintentar).
            reconociendo = null;
        });
    }

    // 3) Devolvemos la conexión: la que ya estaba, o la que se está abriendo.
    return reconociendo;
}

// Exportamos DOS cosas:
// - sql: el módulo mssql completo. Las rutas lo necesitan para los tipos
//   (sql.VarChar, sql.Int, sql.Date) y para las transacciones.
// - getPool: la función que entrega la conexión lista para usar.
module.exports = { sql, getPool };