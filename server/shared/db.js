import pg from 'pg';
import { config } from './config.js';

const { Pool } = pg;

// Single shared connection pool for the whole modular monolith.
export const pool = new Pool({
  connectionString: config.databaseUrl,
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (err) => {
  console.error('[db] unexpected idle client error', err);
});

/**
 * Run a query against the pool. Thin convenience wrapper.
 */
export function query(text, params) {
  return pool.query(text, params);
}

/**
 * Run a set of statements inside a single transaction. The callback receives a
 * dedicated client; commit/rollback is handled automatically. Every financial
 * operation (FIFO allocation, invoice creation) runs through this.
 */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
