import { query } from '../../shared/db.js';

export function list(tenantId, f = {}) {
  const params = [tenantId];
  let sql = `SELECT ci.*, c.name AS company_name, v.plate AS vehicle_plate
             FROM client_invoices ci
             JOIN companies c ON c.id = ci.company_id
             LEFT JOIN vehicles v ON v.id = ci.vehicle_id
             WHERE ci.tenant_id = $1`;
  const add = (cond, val) => {
    params.push(val);
    sql += ` AND ${cond.replace('?', `$${params.length}`)}`;
  };
  if (f.company_id) add('ci.company_id = ?', f.company_id);
  if (f.status) add('ci.status = ?', f.status);
  if (f.date_from) add('ci.issue_date >= ?', f.date_from);
  if (f.date_to) add('ci.issue_date <= ?', f.date_to);
  sql += ` ORDER BY ci.issue_date DESC, ci.id DESC`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(`SELECT * FROM client_invoices WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}

/** Next sequential number for a tenant, e.g. INV-2026-0001. */
export async function nextInvoiceNumber(client, tenantId) {
  const year = new Date().getFullYear();
  const { rows } = await client.query(
    `SELECT COUNT(*)::int AS n FROM client_invoices
     WHERE tenant_id = $1 AND invoice_number LIKE $2`,
    [tenantId, `INV-${year}-%`],
  );
  const seq = String(rows[0].n + 1).padStart(4, '0');
  return `INV-${year}-${seq}`;
}

export function create(client, tenantId, d) {
  return client
    .query(
      `INSERT INTO client_invoices
        (tenant_id, company_id, vehicle_id, invoice_number, description, amount, currency,
         original_amount, exchange_rate, issue_date, due_date, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`,
      [tenantId, d.company_id, d.vehicle_id || null, d.invoice_number, d.description, d.amount,
       d.currency, d.original_amount || null, d.exchange_rate || 1, d.issue_date, d.due_date, d.status],
    )
    .then((r) => r.rows[0]);
}

export function updateStatus(tenantId, id, status) {
  return query(`UPDATE client_invoices SET status = $3 WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
    tenantId, id, status,
  ]).then((r) => r.rows[0]);
}
