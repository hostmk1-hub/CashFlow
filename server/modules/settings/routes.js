import { Router } from 'express';
import { settingSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import { requireMinRole } from '../../shared/middleware/auth.js';
import { query } from '../../shared/db.js';
import { encrypt, decrypt } from '../../shared/crypto.js';
import { testConnection, listModels } from '../../services/geminiService.js';
import { runBackup, lastBackup, lastVerification } from '../../services/backupService.js';
import { r2Enabled, smtpEnabled } from '../../shared/config.js';
import { sendAdminMail } from '../../services/mailer.js';
import { testEmail } from '../../services/emailTemplates.js';

const router = Router();

// Keys whose stored value is encrypted and must never be returned in plaintext.
const SECRET_KEYS = new Set(['gemini_api_key', 'gemini_api_key_paid', 'rentalsyst_api_key']);

// A partial hint so an admin can verify the RIGHT key is saved without exposing
// it: first 5 + last 4 characters, middle masked. e.g. "AIzaS…4x9z".
function keyHint(encrypted) {
  const dec = decrypt(encrypted);
  if (!dec) return '••••••••'; // can't decrypt (ENCRYPTION_KEY changed) → just mask
  const s = String(dec);
  if (s.length <= 10) return `${s.slice(0, 2)}…${s.slice(-2)}`;
  return `${s.slice(0, 5)}…${s.slice(-4)}`;
}

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT key, value FROM settings WHERE tenant_id = $1`, [req.tenantId]);
    const out = {};
    for (const r of rows) {
      out[r.key] = SECRET_KEYS.has(r.key) ? keyHint(r.value) : r.value; // hint for secrets
    }
    res.json(out);
  }),
);

router.put(
  '/',
  requireMinRole('admin'),
  asyncHandler(async (req, res) => {
    const { key, value } = settingSchema.parse(req.body);
    const stored = SECRET_KEYS.has(key) ? encrypt(value) : value;
    await query(
      `INSERT INTO settings (tenant_id, key, value) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, key) DO UPDATE SET value = EXCLUDED.value`,
      [req.tenantId, key, stored],
    );
    res.json({ ok: true, key });
  }),
);

router.post(
  '/gemini/test',
  requireMinRole('admin'),
  asyncHandler(async (req, res) => {
    // Optional { tier: 'free' | 'paid' } tests just that key.
    res.json(await testConnection(req.tenantId, req.body?.tier));
  }),
);
router.get(
  '/gemini/models',
  asyncHandler(async (req, res) => {
    res.json(await listModels(req.tenantId));
  }),
);

// Backup status + manual "Backup Now"
router.get(
  '/backup/status',
  asyncHandler(async (_req, res) => {
    res.json({
      last: lastBackup(),
      r2Enabled: r2Enabled(),
      smtpEnabled: smtpEnabled(),
      verification: lastVerification(),
    });
  }),
);
router.post(
  '/backup/run',
  requireMinRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(await runBackup());
  }),
);
router.post(
  '/email/test',
  requireMinRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(await sendAdminMail(testEmail()));
  }),
);

export default router;
