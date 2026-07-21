import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { S3Client, PutObjectCommand, ListObjectsV2Command, GetObjectCommand } from '@aws-sdk/client-s3';
import { config, r2Enabled } from '../shared/config.js';

const execAsync = promisify(exec);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKUP_DIR = path.resolve(__dirname, '../backups');

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
export async function runBackup() {
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

    console.log(`[backup] wrote ${path.basename(file)}${r2Key ? ' (+R2)' : ''}`);
    return { ok: true, file: path.basename(file), r2: r2Key, r2Enabled: r2Enabled() };
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
