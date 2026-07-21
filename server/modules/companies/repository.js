import { query } from '../../shared/db.js';

export function list(tenantId, { type, category, q } = {}) {
  const params = [tenantId];
  let sql = `SELECT c.*, cb.total_invoiced, cb.total_paid, cb.open_balance
             FROM companies c
             LEFT JOIN company_balances cb ON cb.id = c.id
             WHERE c.tenant_id = $1 AND c.active = true`;
  if (type) {
    params.push(type);
    sql += ` AND c.type = $${params.length}`;
  }
  if (category) {
    params.push(category);
    sql += ` AND c.category = $${params.length}`;
  }
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND c.name ILIKE $${params.length}`; // ILIKE is Cyrillic/locale aware
  }
  sql += ` ORDER BY cb.open_balance DESC NULLS LAST, c.name`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(`SELECT * FROM companies WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}

export function create(tenantId, data) {
  return query(
    `INSERT INTO companies (tenant_id, name, type, category, phone, note)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, data.name, data.type || 'vendor', data.category || null, data.phone || null, data.note || null],
  ).then((r) => r.rows[0]);
}

export function update(tenantId, id, data) {
  return query(
    `UPDATE companies SET
       name = COALESCE($3, name),
       type = COALESCE($4, type),
       category = COALESCE($5, category),
       phone = COALESCE($6, phone),
       note = COALESCE($7, note)
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [tenantId, id, data.name ?? null, data.type ?? null, data.category ?? null, data.phone ?? null, data.note ?? null],
  ).then((r) => r.rows[0]);
}

export function softDelete(tenantId, id) {
  return query(`UPDATE companies SET active = false WHERE tenant_id = $1 AND id = $2 RETURNING id`, [
    tenantId,
    id,
  ]).then((r) => r.rows[0]);
}

// ── Ledger helpers ────────────────────────────────────────────
export function balances(tenantId, id) {
  return query(`SELECT * FROM company_balances WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}
export function clientBalances(tenantId, id) {
  return query(`SELECT * FROM client_balances WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}
export function invoiceHistory(tenantId, id) {
  return query(
    `SELECT * FROM invoices WHERE tenant_id = $1 AND company_id = $2 ORDER BY due_date DESC, id DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function paymentHistory(tenantId, id) {
  return query(
    `SELECT * FROM payments WHERE tenant_id = $1 AND company_id = $2 ORDER BY paid_at DESC, id DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function clientInvoiceHistory(tenantId, id) {
  return query(
    `SELECT * FROM client_invoices WHERE tenant_id = $1 AND company_id = $2 ORDER BY issue_date DESC, id DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function clientPaymentHistory(tenantId, id) {
  return query(
    `SELECT * FROM client_payments WHERE tenant_id = $1 AND company_id = $2 ORDER BY paid_at DESC, id DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function linkedVehicles(tenantId, id) {
  return query(
    `SELECT DISTINCT v.* FROM vehicles v
     JOIN amortization_plans p ON p.vehicle_id = v.id
     WHERE v.tenant_id = $1 AND p.company_id = $2`,
    [tenantId, id],
  ).then((r) => r.rows);
}
