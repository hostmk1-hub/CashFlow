import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import pg from 'pg';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { config, r2Enabled, smtpEnabled } from '../shared/config.js';
import { query } from '../shared/db.js';
import { notify } from '../modules/notifications/service.js';
import { backupSuccess, backupFailed } from './emailTemplates.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../backups');

// Last verification result, surfaced in the Settings backup panel.
let lastVerify = null;
export const lastVerification = () => lastVerify;

const TABLES_TO_CHECK = ['tenants', 'users', 'companies', 'vehicles', 'workers', 'invoices', 'payments', 'client_invoices'];

/**
 * Verify a dump actually restores: create a throwaway database, restore the
 * dump into it with ON_ERROR_STOP (any SQL error aborts), compare row counts
 * against the live database, then drop the throwaway db. Returns pass/fail.
 */
export async function verifyDump(filePath) {
  const base = new URL(config.databaseUrl);
  const verifyName = `finance_verify_${Date.now()}`;
  const maintUrl = new URL(config.databaseUrl); maintUrl.pathname = '/postgres';
  const verifyUrl = new URL(config.databaseUrl); verifyUrl.pathname = '/' + verifyName;

  const maint = new pg.Client({ connectionString: maintUrl.toString() });
  const checks = [];
  let verified = false;
  let error = null;
  try {
    await maint.connect();
    await maint.query(`DROP DATABASE IF EXISTS "${verifyName}" WITH (FORCE)`);
    await maint.query(`CREATE DATABASE "${verifyName}"`);

    // Restore — ON_ERROR_STOP=1 makes psql exit non-zero on any SQL error.
    await execAsync(`gunzip -c "${filePath}" | psql -v ON_ERROR_STOP=1 "${verifyUrl.toString()}"`, {
      maxBuffer: 1024 * 1024 * 256,
    });

    const ver = new pg.Client({ connectionString: verifyUrl.toString() });
    await ver.connect();
    for (const t of TABLES_TO_CHECK) {
      const live = Number((await query(`SELECT count(*)::int c FROM ${t}`)).rows[0].c);
      const restored = Number((await ver.query(`SELECT count(*)::int c FROM ${t}`)).rows[0].c);
      // Tolerate small drift between the dump snapshot and "now" (± 5%, min 1).
      const ok = Math.abs(restored - live) <= Math.max(1, Math.floor(live * 0.05));
      checks.push({ table: t, live, restored, ok });
    }
    await ver.end();
    verified = checks.every((c) => c.ok);
    if (!verified) error = 'row-count mismatch: ' + JSON.stringify(checks.filter((c) => !c.ok));
  } catch (e) {
    error = e.message;
  } finally {
    try { await maint.query(`DROP DATABASE IF EXISTS "${verifyName}" WITH (FORCE)`); } catch { /* ignore */ }
    await maint.end().catch(() => {});
  }
  lastVerify = { verified, error, checks, at: new Date().toISOString() };
  return lastVerify;
}

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2.endpoint,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
}

async function uploadToR2(filePath) {
  const key = config.r2.prefix + path.basename(filePath);
  await r2Client().send(
    new PutObjectCommand({
      Bucket: config.r2.bucket,
      Key: key,
      Body: fs.createReadStream(filePath),
      ContentType: 'application/gzip',
    }),
  );
  return key;
}

/**
 * pg_dump → gzip into /server/backups, then (if R2 is configured) upload the
 * dump off-site to Cloudflare R2. Dumps use --clean --if-exists so they restore
 * cleanly over an existing database (see scripts/restore.js). Old local dumps
 * are pruned to the most recent 14.
 */
export async function runBackup({ verifyAfter = true } = {}) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(BACKUP_DIR, `finance-${stamp}.sql.gz`);
  try {
    await execAsync(
      `pg_dump --clean --if-exists --no-owner --no-privileges "${config.databaseUrl}" | gzip > "${file}"`,
      { maxBuffer: 1024 * 1024 * 64 },
    );

    let r2Key = null;
    if (r2Enabled()) {
      try {
        r2Key = await uploadToR2(file);
        console.log(`[backup] uploaded to R2: ${r2Key}`);
      } catch (e) {
        console.error('[backup] R2 upload failed (kept local copy):', e.message);
      }
    }

    const dumps = fs.readdirSync(BACKUP_DIR).filter((f) => f.endsWith('.sql.gz')).sort();
    for (const old of dumps.slice(0, -14)) fs.unlinkSync(path.join(BACKUP_DIR, old));

    // Verify the dump actually restores + matches the live DB.
    let verify = null;
    if (verifyAfter) {
      verify = await verifyDump(file);
      if (!verify.verified) {
        await notify({
          level: 'critical',
          title: 'Backup verification FAILED',
          message: `Dump ${path.basename(file)} did not verify: ${verify.error || 'unknown'}`,
          context: { file: path.basename(file), checks: verify.checks },
          email: smtpEnabled() ? backupFailed({ stage: 'verification', error: verify.error, file: path.basename(file) }) : null,
        });
      }
    }

    console.log(`[backup] wrote ${path.basename(file)}${r2Key ? ' (+R2)' : ''}${verify ? (verify.verified ? ' (verified ✓)' : ' (VERIFY FAILED)') : ''}`);
    return { ok: true, file: path.basename(file), r2: r2Key, r2Enabled: r2Enabled(), verified: verify?.verified ?? null, checks: verify?.checks };
  } catch (err) {
    console.error('[backup] failed', err.message);
    await notify({
      level: 'critical',
      title: 'Database backup FAILED',
      message: err.message,
      email: smtpEnabled() ? backupFailed({ stage: 'dump', error: err.message }) : null,
    });
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

/** List backups available in R2 (newest first). */
export async function listR2Backups() {
  if (!r2Enabled()) return [];
  const out = await r2Client().send(
    new ListObjectsV2Command({ Bucket: config.r2.bucket, Prefix: config.r2.prefix }),
  );
  return (out.Contents || [])
    .map((o) => ({ key: o.Key, file: path.basename(o.Key), size: o.Size, at: o.LastModified }))
    .sort((a, b) => new Date(b.at) - new Date(a.at));
}

/** Download a dump from R2 into the local backups dir; returns the local path. */
export async function fetchFromR2(fileName) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const key = fileName.includes('/') ? fileName : config.r2.prefix + fileName;
  const res = await r2Client().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }));
  const dest = path.join(BACKUP_DIR, path.basename(key));
  await new Promise((resolve, reject) => {
    const w = fs.createWriteStream(dest);
    res.Body.pipe(w);
    res.Body.on('error', reject);
    w.on('finish', resolve);
  });
  return dest;
}

export { BACKUP_DIR };
