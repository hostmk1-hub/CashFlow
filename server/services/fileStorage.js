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
 * Persist a scanned invoice file: writes it to the local uploads volume (served
 * at /uploads/scans and used for downloads) AND, when R2 is configured, uploads
 * a copy off-site. Returns the web path stored as the invoice's scan_url.
 */
export async function saveScan(tenantId, file) {
  fs.mkdirSync(SCAN_DIR, { recursive: true });
  const name = `scan-${tenantId}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${extFor(file)}`;
  fs.writeFileSync(path.join(SCAN_DIR, name), file.buffer);

  let r2 = false;
  if (r2Enabled()) {
    try {
      await r2Client().send(
        new PutObjectCommand({
          Bucket: config.r2.bucket,
          Key: R2_SCAN_PREFIX + name,
          Body: file.buffer,
          ContentType: file.mimetype || 'application/octet-stream',
        }),
      );
      r2 = true;
    } catch (err) {
      console.error('[scan] R2 upload failed (kept local copy):', err.message);
    }
  }
  return { scan_url: `/uploads/scans/${name}`, r2 };
}

/**
 * Resolve a scan file for download. Returns { buffer, filename } — from the
 * local volume if present, otherwise pulled back from R2 by filename.
 */
export async function readScan(scanUrl) {
  const name = path.basename(scanUrl);
  const local = path.join(SCAN_DIR, name);
  if (fs.existsSync(local)) return { buffer: fs.readFileSync(local), filename: name };
  if (r2Enabled()) {
    const res = await r2Client().send(new GetObjectCommand({ Bucket: config.r2.bucket, Key: R2_SCAN_PREFIX + name }));
    const chunks = [];
    for await (const c of res.Body) chunks.push(c);
    return { buffer: Buffer.concat(chunks), filename: name };
  }
  return null;
}
