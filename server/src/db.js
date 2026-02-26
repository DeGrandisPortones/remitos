import sql from 'mssql';

const pools = new Map();

function required(name, value) {
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function getSqlConfig(databaseOverride) {
  const server = required('SQL_SERVER', process.env.SQL_SERVER);
  const database = databaseOverride || required('SQL_DATABASE', process.env.SQL_DATABASE);
  const user = required('SQL_USER', process.env.SQL_USER);
  const password = required('SQL_PASSWORD', process.env.SQL_PASSWORD);

  const port = process.env.SQL_PORT ? Number(process.env.SQL_PORT) : 1433;
  const encrypt = (process.env.SQL_ENCRYPT ?? 'false').toLowerCase() === 'true';
  const trustServerCertificate = (process.env.SQL_TRUST_SERVER_CERT ?? 'true').toLowerCase() === 'true';
  const instanceName = process.env.SQL_INSTANCE_NAME || undefined;

  return {
    user,
    password,
    server,
    database,
    port,
    options: {
      encrypt,
      trustServerCertificate,
      ...(instanceName ? { instanceName } : {})
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  };
}

export async function getPool(databaseOverride) {
  const dbName = databaseOverride || process.env.SQL_DATABASE;
  if (!dbName) throw new Error('Missing SQL_DATABASE (and no override provided).');

  if (!pools.has(dbName)) {
    const pool = new sql.ConnectionPool(getSqlConfig(dbName));
    pools.set(dbName, pool.connect());
  }
  return pools.get(dbName);
}

export { sql };
