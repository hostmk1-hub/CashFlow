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

export function create(tenantId, d, client = null) {
  const runner = client || { query };
  return runner
    .query(
      `INSERT INTO invoices
        (tenant_id, company_id, worker_id, vehicle_id, amort_plan_id, invoice_number,
         description, amount, due_date, status, source, currency, original_amount, exchange_rate,
         scanned, scan_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'open',$10,$11,$12,$13,$14,$15) RETURNING *`,
      [
        tenantId, d.company_id || null, d.worker_id || null, d.vehicle_id || null,
        d.amort_plan_id || null, d.invoice_number || null, d.description, d.amount, d.due_date,
        d.source || 'manual', d.currency || 'MKD', d.original_amount || null,
        d.exchange_rate || 1, d.scanned || false, d.scan_url || null,
      ],
    )
    .then((r) => r.rows[0]);
}
