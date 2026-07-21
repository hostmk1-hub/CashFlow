import crypto from 'node:crypto';
import { config } from './config.js';

// AES-256-GCM encryption for secrets stored in the settings table
// (e.g. a tenant's own Gemini API key). Key is a 32-byte hex string.
const KEY = Buffer.from(config.encryptionKey, 'hex').subarray(0, 32);

export function encrypt(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const enc = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${enc.toString('hex')}`;
}

export function decrypt(payload) {
  try {
    const [ivHex, tagHex, dataHex] = String(payload).split(':');
    if (!ivHex || !tagHex || !dataHex) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
    const dec = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null;
  }
}
