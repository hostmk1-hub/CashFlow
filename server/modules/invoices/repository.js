import { query } from '../../shared/db.js';

export function list(tenantId, f = {}) {
  const params = [tenantId];
  let sql = `
    SELECT i.*, c.name AS company_name, w.name AS worker_name, v.plate AS vehicle_plate
    FROM invoices i
    LEFT JOIN companies c ON c.id = i.company_id
    LEFT JOIN workers w ON w.id = i.worker_id
    LEFT JOIN vehicles v ON v.id = i.vehicle_id
    WHERE i.tenant_id = $1`;
  const add = (cond, val) => {
    params.push(val);
    sql += ` AND ${cond.replace('?', `$${params.length}`)}`;
  };
  if (f.company_id) add('i.company_id = ?', f.company_id);
  if (f.worker_id) add('i.worker_id = ?', f.worker_id);
  if (f.vehicle_id) add('i.vehicle_id = ?', f.vehicle_id);
  if (f.status) add('i.status = ?', f.status);
  if (f.source) add('i.source = ?', f.source);
  if (f.category) add('i.category = ?', f.category);
  if (f.currency) add('i.currency = ?', f.currency);
  if (f.date_from) add('i.due_date >= ?', f.date_from);
  if (f.date_to) add('i.due_date <= ?', f.date_to);
  sql += ` ORDER BY i.due_date DESC, i.id DESC`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(
    `SELECT i.*, c.name AS company_name, w.name AS worker_name, v.plate AS vehicle_plate
     FROM invoices i
     LEFT JOIN companies c ON c.id = i.company_id
     LEFT JOIN workers w ON w.id = i.worker_id
     LEFT JOIN vehicles v ON v.id = i.vehicle_id
     WHERE i.tenant_id = $1 AND i.id = $2`,
    [tenantId, id],
  ).then((r) => r.rows[0]);
}

export function allocations(tenantId, invoiceId) {
  return query(
    `SELECT pa.*, p.paid_at, p.method FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = $1 AND p.tenant_id = $2 ORDER BY p.paid_at`,
    [invoiceId, tenantId],
  ).then((r) => r.rows);
}

export function hasAllocations(tenantId, invoiceId) {
  return query(
    `SELECT 1 FROM payment_allocations pa JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = $1 AND p.tenant_id = $2 LIMIT 1`,
    [invoiceId, tenantId],
  ).then((r) => r.rows.length > 0);
}

export function update(tenantId, id, d) {
  return query(
    `UPDATE invoices SET
       company_id = $3, worker_id = $4, vehicle_id = $5, invoice_number = $6,
       description = $7, amount = $8, due_date = $9, currency = $10,
       original_amount = $11, exchange_rate = $12, category = $13,
       installment_count = $14, installment_amount = $15, status = $16
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [
      tenantId, id, d.company_id, d.worker_id, d.vehicle_id, d.invoice_number,
      d.description, d.amount, d.due_date, d.currency, d.original_amount,
      d.exchange_rate, d.category, d.installment_count, d.installment_amount, d.status,
    ],
  ).then((r) => r.rows[0]);
}

export function remove(tenantId, id) {
  return query(`DELETE FROM invoices WHERE tenant_id = $1 AND id = $2 RETURNING id`, [
    tenantId, id,
  ]).then((r) => r.rows[0]);
}

export function create(tenantId, d, client = null) {
  const runner = client || { query };
  return runner
    .query(
      `INSERT INTO invoices
        (tenant_id, company_id, worker_id, vehicle_id, amort_plan_id, invoice_number,
         description, amount, due_date, status, source, currency, original_amount, exchange_rate,
         scanned, scan_url, installment_count, installment_amount, category)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12,$13,$14,$15,$16,$17,$18) RETURNING *`,
      [
        tenantId, d.company_id || null, d.worker_id || null, d.vehicle_id || null,
        d.amort_plan_id || null, d.invoice_number || null, d.description, d.amount, d.due_date,
        d.source || 'manual', d.currency || 'MKD', d.original_amount || null,
        d.exchange_rate || 1, d.scanned || false, d.scan_url || null,
        d.installment_count || null, d.installment_amount || null, d.category || null,
      ],
    )
    .then((r) => r.rows[0]);
}
