import { Router } from 'express';
import { dailyIncomeSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import { requireMinRole } from '../../shared/middleware/auth.js';
import { query } from '../../shared/db.js';

const router = Router();

router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `SELECT * FROM daily_income WHERE tenant_id = $1 ORDER BY income_date DESC LIMIT 60`,
      [req.tenantId],
    );
    res.json(rows);
  }),
);

router.post(
  '/',
  requireMinRole('staff'),
  asyncHandler(async (req, res) => {
    const d = dailyIncomeSchema.parse(req.body);
    const { rows } = await query(
      `INSERT INTO daily_income (tenant_id, income_date, cash_amount, card_amount, note)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (tenant_id, income_date)
       DO UPDATE SET cash_amount = EXCLUDED.cash_amount, card_amount = EXCLUDED.card_amount, note = EXCLUDED.note
       RETURNING *`,
      [req.tenantId, d.income_date, d.cash_amount, d.card_amount, d.note || null],
    );
    res.status(201).json(rows[0]);
  }),
);

router.delete(
  '/:id',
  requireMinRole('staff'),
  asyncHandler(async (req, res) => {
    const { rows } = await query(
      `DELETE FROM daily_income WHERE tenant_id = $1 AND id = $2 RETURNING id`,
      [req.tenantId, Number(req.params.id)],
    );
    res.json({ ok: true, id: rows[0]?.id ?? null });
  }),
);

export default router;
