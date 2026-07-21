import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from '../shared/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = path.resolve(__dirname, '../db/schema.sql');

/**
 * Applies schema.sql. The file is fully idempotent (guarded enums,
 * CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE VIEW) so this is safe to run
 * on every startup and re-runnable by hand via `npm run migrate`.
 */
export async function runMigrations() {
  const sql = fs.readFileSync(SCHEMA_PATH, 'utf8');
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('[migrate] schema applied ✓');
  } finally {
    client.release();
  }
}

// Allow running directly: `node scripts/migrate.js`
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations()
    .then(() => pool.end())
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[migrate] failed', err);
      process.exit(1);
    });
}
