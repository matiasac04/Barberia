// ── Configuración de la conexión ──────────────────────
require('dotenv').config();

const sql = require('mssql');

const config = {
    user: process.env.usuario_bd,
    password: process.env.psw_bd,
    server: process.env.servido_bd,
    database: process.env.nombre_bd,        
    options: {
        encrypt: true,               
        trustServerCertificate: true  
    },
    port: 1433                        
};

// ── Pool de conexiones ────────────────────────────────
let pool; 
let lastPoolCheck = 0;
const POOL_PING_INTERVAL = 5000;

async function getPool() {
    if (pool && Date.now() - lastPoolCheck < POOL_PING_INTERVAL) {
        return pool;
    }

    if (pool) {
        try {
            await pool.request().query("SELECT 1");
            lastPoolCheck = Date.now();
            return pool;
        } catch {
            try { await pool.close(); } catch {}
            pool = undefined;
        }
    }

    try {
      pool = await sql.connect(config);
    } catch (err) {
      console.error("Error al conectar a la base de datos: ", err);
      throw err;
    }
    lastPoolCheck = Date.now();
    console.log("¡Conectado exitosamente al SQL Server de mi Windows!");
    return pool;
}

module.exports = { sql, getPool };