import { Router } from 'express';
import { settingSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import { requireMinRole } from '../../shared/middleware/auth.js';
import { query } from '../../shared/db.js';
import { encrypt } from '../../shared/crypto.js';
import { testConnection } from '../../services/geminiService.js';
import { runBackup, lastBackup } from '../../services/backupService.js';

const router = Router();

// Keys whose stored value is encrypted and must never be returned in plaintext.
const SECRET_KEYS = new Set(['gemini_api_key', 'rentalsyst_api_key']);

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(`SELECT key, value FROM settings WHERE tenant_id = $1`, [req.tenantId]);
    const out = {};
    for (const r of rows) {
      out[r.key] = SECRET_KEYS.has(r.key) ? '••••••••' : r.value; // mask secrets
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
    res.json(await testConnection(req.tenantId));
  }),
);

// Backup status + manual "Backup Now"
router.get(
  '/backup/status',
  asyncHandler(async (_req, res) => {
    res.json({ last: lastBackup() });
  }),
);
router.post(
  '/backup/run',
  requireMinRole('admin'),
  asyncHandler(async (_req, res) => {
    res.json(await runBackup());
  }),
);

export default router;
