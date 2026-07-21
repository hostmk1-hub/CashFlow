import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Load .env from the repo root (one level above /server) if present.
dotenv.config({ path: path.resolve(__dirname, '../../.env') });
dotenv.config(); // also pick up a local /server/.env when running standalone

export const config = {
  port: Number(process.env.PORT) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl:
    process.env.DATABASE_URL ||
    'postgres://finance:finance@localhost:5432/finance',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  encryptionKey:
    process.env.ENCRYPTION_KEY ||
    '0000000000000000000000000000000000000000000000000000000000000000',
  gemini: {
    apiKey: process.env.GEMINI_API_KEY || '',
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
  },
  defaultEurRate: Number(process.env.DEFAULT_EUR_RATE) || 61.8,
  redisUrl: process.env.REDIS_URL || '',
  cacheTtl: Number(process.env.CACHE_TTL_SECONDS) || 300,
  // SMTP for admin notifications (optional — logs only when unset).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || 'Finance Rentonic <no-reply@rentonic.app>',
  },
  adminEmail: process.env.ADMIN_EMAIL || '',
  // Cloudflare R2 (S3-compatible) off-site backup target. All optional — when
  // unset, backups stay local only.
  r2: {
    endpoint:
      process.env.R2_ENDPOINT ||
      (process.env.R2_ACCOUNT_ID
        ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`
        : ''),
    accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    bucket: process.env.R2_BUCKET || '',
    prefix: process.env.R2_PREFIX || 'finance-backups/',
  },
};

export const r2Enabled = () =>
  Boolean(config.r2.endpoint && config.r2.accessKeyId && config.r2.secretAccessKey && config.r2.bucket);

export const smtpEnabled = () => Boolean(config.smtp.host && config.adminEmail);
