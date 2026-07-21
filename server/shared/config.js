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
};
