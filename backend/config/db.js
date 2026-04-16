const sql = require('mssql');
require('dotenv').config();

const config = {
  server: process.env.DB_SERVER,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT) || 1433,
  options: {
    encrypt: process.env.DB_ENCRYPT !== 'false', // true cho cloud/SmarterASP
    trustServerCertificate: process.env.DB_TRUST_CERT === 'true', // false cho production
    connectionTimeout: 30000,
    requestTimeout: 30000,
    enableArithAbort: true,
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

let pool;

async function connectDB() {
  try {
    pool = new sql.ConnectionPool(config);

    pool.on('error', (err) => {
      console.error('SQL Pool error:', err);
    });

    await pool.connect();
    console.log('✅ Connected to SQL Server successfully');
    return pool;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    throw error;
  }
}

function getPool() {
  if (!pool) {
    throw new Error('Database pool not initialized. Call connectDB() first.');
  }
  return pool;
}

async function closeDB() {
  if (pool) {
    await pool.close();
    pool = null;
    console.log('Database connection closed');
  }
}

module.exports = {
  connectDB,
  getPool,
  closeDB,
  sql,
};
