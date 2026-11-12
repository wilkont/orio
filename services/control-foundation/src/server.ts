import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
import { createProtocolServer, ProtocolReader } from './protocol-api.ts';

const connectionString = process.env.ORIO_DATABASE_URL;
const caPath = process.env.ORIO_PG_CA_FILE;
if (!connectionString || !caPath) throw new Error('Configure the database URL and trusted PostgreSQL CA file');
let databaseUrl: URL;
try {
  databaseUrl = new URL(connectionString);
} catch {
  throw new Error('Invalid database connection URL');
}
if (!['postgres:', 'postgresql:'].includes(databaseUrl.protocol))
  throw new Error('Unsupported database connection protocol');
if (databaseUrl.search !== '')
  throw new Error('Configure database TLS through the trusted CA file');
const portText = process.env.PORT ?? '8080';
if (!/^[1-9][0-9]{0,4}$/.test(portText) || Number(portText) > 65535) throw new Error('Invalid service port');

const pool = new Pool({
  connectionString, max: 5, connectionTimeoutMillis: 5000,
  query_timeout: 5000, ssl: { ca: await readFile(caPath, 'utf8'), rejectUnauthorized: true },
  options: '-c default_transaction_read_only=on -c statement_timeout=5000',
});
pool.on('error', () => { console.error('Protocol database connection error'); });
const server = createProtocolServer(new ProtocolReader(pool));
await new Promise<void>((resolve, reject) => {
  server.once('error', reject);
  server.listen(Number(portText), '127.0.0.1', resolve);
});
console.log('ORIO protocol metadata service started');
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  server.close();
  server.closeIdleConnections();
  await pool.end();
}
process.once('SIGTERM', () => { void close(); });
process.once('SIGINT', () => { void close(); });
