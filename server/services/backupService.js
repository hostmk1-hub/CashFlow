import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { config } from '../shared/config.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../backups');

/**
 * Runs pg_dump against DATABASE_URL and writes a timestamped .sql.gz into
 * /server/backups. Uploading the dump to Cloudflare R2 is the documented next
 * step (S3-compatible PUT) — the local dump is produced here regardless.
 */
export async function runBackup() {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `finance-${stamp}.sql.gz`);
  try {
    await execAsync(`pg_dump "${config.databaseUrl}" | gzip > "${file}"`, {
      maxBuffer: 1024 * 1024 * 64,
    });
    // Keep only the 14 most recent dumps.
    const dumps = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql.gz')).sort();
    for (const old of dumps.slice(0, -14)) fs.unlinkSync(path.join(BACKUP_DIR, old));
    console.log(`[backup] wrote ${path.basename(file)}`);
    return { ok: true, file: path.basename(file) };
  } catch (err) {
    console.error('[backup] failed', err.message);
    return { ok: false, error: err.message };
  }
}

export function lastBackup() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const dumps = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.endsWith('.sql.gz'))
    .map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtime }))
    .sort((a, b) => b.t - a.t);
  return dumps[0] ? { file: dumps[0].f, at: dumps[0].t.toISOString() } : null;
}
