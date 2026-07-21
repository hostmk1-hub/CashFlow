import { query } from '../../shared/db.js';

export function list(tenantId, { q } = {}) {
  const params = [tenantId];
  let sql = `
    SELECT w.*,
      COALESCE((SELECT SUM(amount - paid_amount) FROM invoices
                WHERE worker_id = w.id AND tenant_id = w.tenant_id AND status != 'paid'), 0) AS open_balance
    FROM workers w WHERE w.tenant_id = $1 AND w.active = true`;
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND w.name ILIKE $${params.length}`;
  }
  sql += ` ORDER BY w.name`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(`SELECT * FROM workers WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}
export function create(tenantId, d) {
  return query(
    `INSERT INTO workers (tenant_id, name, position, net_salary, payday_day)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [tenantId, d.name, d.position || null, d.net_salary, d.payday_day ?? 5],
  ).then((r) => r.rows[0]);
}
export function update(tenantId, id, d) {
  return query(
    `UPDATE workers SET name = COALESCE($3,name), position = COALESCE($4,position),
       net_salary = COALESCE($5,net_salary), payday_day = COALESCE($6,payday_day)
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [tenantId, id, d.name ?? null, d.position ?? null, d.net_salary ?? null, d.payday_day ?? null],
  ).then((r) => r.rows[0]);
}
export function softDelete(tenantId, id) {
  return query(`UPDATE workers SET active = false WHERE tenant_id = $1 AND id = $2 RETURNING id`, [
    tenantId,
    id,
  ]).then((r) => r.rows[0]);
}
export function salaryHistory(tenantId, id) {
  return query(
    `SELECT * FROM invoices WHERE tenant_id = $1 AND worker_id = $2 ORDER BY due_date DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function paymentHistory(tenantId, id) {
  return query(
    `SELECT * FROM payments WHERE tenant_id = $1 AND worker_id = $2 ORDER BY paid_at DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
