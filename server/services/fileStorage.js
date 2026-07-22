import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { config, r2Enabled } from '../shared/config.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCAN_DIR = path.resolve(__dirname, '../uploads/scans');
const R2_SCAN_PREFIX = 'invoice-scans/';

function r2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: config.r2.endpoint,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
}

function extFor(file) {
  const fromName = (file.originalname || '').split('.').pop();
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromMime = (file.mimetype || '').split('/').pop();
  return (fromMime || 'bin').toLowerCase();
}

/**
 * Persist a scanned invoice file. When R2 is configured it is stored ONLY on R2
 * (nothing kept on the local disk) — so moving the server needs no file
 * migration, everything lives in the cloud. If R2 isn't configured it falls back
 * to the local uploads volume. Returns the web path stored as the scan_url.
 */
export async function saveScan(tenantId, file) {
  const name = `scan-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extFor(file)}`;
  if (r2Enabled()) {
    await r2Client().send(
      new PutObjectCommand({
        Bucket: config.r2.bucket,
        Key: R2_SCAN_PREFIX + name,
        Body: file.buffer,
        ContentType: file.mimetype || 'application/octet-stream',
      }),
    );
    return { scan_url: `/uploads/scans/${name}`, r2: true };
  }
  fs.mkdirSync(SCAN_DIR, { recursive: true });
  fs.writeFileSync(path.join(SCAN_DIR, name), file.buffer);
  return { scan_url: `/uploads/scans/${name}`, r2: false };
}

/**
 * Resolve a scan file for download. Returns { buffer, filename } — from R2 first
 * when configured, otherwise the local volume.
 */
export async function readScan(scanUrl) {
  const name = path.basename(scanUrl);
  if (r2Enabled()) {
    try {
      const res = await r2Client().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: R2_SCAN_PREFIX + name }));
      const chunks = [];
      for await (const c of res.Body) chunks.push(c);
      return { buffer: Buffer.concat(chunks), filename: name };
    } catch (err) {
      console.error('[scan] R2 read failed, trying local:', err.message);
    }
  }
  const local = path.join(SCAN_DIR, name);
  if (fs.existsSync(local)) return { buffer: fs.readFileSync(local), filename: name };
  return null;
}
