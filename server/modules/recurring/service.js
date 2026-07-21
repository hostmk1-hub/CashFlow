import { query, withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import * as invoiceRepo from '../invoices/repository.js';

export function list(tenantId) {
  return query(
    `SELECT rt.*, c.name AS company_name, w.name AS worker_name, v.plate AS vehicle_plate
     FROM recurring_templates rt
     LEFT JOIN companies c ON c.id = rt.company_id
     LEFT JOIN workers w ON w.id = rt.worker_id
     LEFT JOIN vehicles v ON v.id = rt.vehicle_id
     WHERE rt.tenant_id = $1 ORDER BY rt.day_of_month`,
    [tenantId],
  ).then((r) => r.rows);
}

export function create(tenantId, d) {
  return query(
    `INSERT INTO recurring_templates (tenant_id, company_id, worker_id, vehicle_id, description, amount, day_of_month, active)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [tenantId, d.company_id || null, d.worker_id || null, d.vehicle_id || null, d.description, d.amount, d.day_of_month, d.active ?? true],
  ).then((r) => r.rows[0]);
}

export function update(tenantId, id, d) {
  return query(
    `UPDATE recurring_templates SET description = COALESCE($3,description), amount = COALESCE($4,amount),
       day_of_month = COALESCE($5,day_of_month), active = COALESCE($6,active)
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [tenantId, id, d.description ?? null, d.amount ?? null, d.day_of_month ?? null, d.active ?? null],
  ).then((r) => r.rows[0]);
}

export function remove(tenantId, id) {
  return query(`DELETE FROM recurring_templates WHERE tenant_id = $1 AND id = $2 RETURNING id`, [
    tenantId, id,
  ]).then((r) => r.rows[0]);
}

/**
 * Recurring-engine status for the Settings page: when it last generated an
 * invoice for this tenant, and when the daily cron (00:05) next runs.
 */
export async function status(tenantId) {
  const { rows } = await query(
    `SELECT MAX(last_generated) AS last_generated,
            COUNT(*) FILTER (WHERE active) AS active_templates
     FROM recurring_templates WHERE tenant_id = $1`,
    [tenantId],
  );
  const now = new Date();
  const next = new Date(now);
  next.setHours(0, 5, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return {
    lastRun: rows[0].last_generated,
    nextRun: next.toISOString(),
    activeTemplates: Number(rows[0].active_templates),
  };
}

/**
 * Cron entry point: for each active template not yet generated this month,
 * create an invoice due on this month's day_of_month and stamp last_generated.
 * Runs across all tenants (the daily job is global).
 */
export async function generateDueInvoices() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const { rows: templates } = await query(
    `SELECT * FROM recurring_templates
     WHERE active = true AND (last_generated IS NULL OR last_generated < $1)`,
    [monthStart],
  );
  let generated = 0;
  for (const t of templates) {
    const dueDate = new Date(now.getFullYear(), now.getMonth(), t.day_of_month).toISOString().slice(0, 10);
    await withTransaction(async (client) => {
      await invoiceRepo.create(
        t.tenant_id,
        {
          company_id: t.company_id,
          worker_id: t.worker_id,
          vehicle_id: t.vehicle_id,
          description: t.description,
          amount: t.amount,
          due_date: dueDate,
          source: t.worker_id ? 'salary' : 'recurring',
          currency: 'MKD',
          exchange_rate: 1,
        },
        client,
      );
      await client.query(`UPDATE recurring_templates SET last_generated = $2 WHERE id = $1`, [t.id, monthStart]);
    });
    generated++;
  }
  if (generated) console.log(`[recurring] generated ${generated} invoice(s)`);
  return generated;
}
