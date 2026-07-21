import { query } from '../../shared/db.js';

export function list(tenantId, { q, activeOnly } = {}) {
  const params = [tenantId];
  let sql = `
    SELECT v.*,
      p.monthly_amount, p.currency AS lease_currency,
      prog.remaining, prog.years_left, prog.installments_left,
      pnl.utilization_pct, pnl.rev_pav
    FROM vehicles v
    LEFT JOIN LATERAL (
      SELECT * FROM amortization_plans ap WHERE ap.vehicle_id = v.id ORDER BY ap.id DESC LIMIT 1
    ) p ON true
    LEFT JOIN vehicle_amortization_progress prog ON prog.plan_id = p.id
    LEFT JOIN LATERAL (
      SELECT utilization_pct, rev_pav FROM vehicle_pnl vp
      WHERE vp.vehicle_id = v.id ORDER BY vp.month DESC NULLS LAST LIMIT 1
    ) pnl ON true
    WHERE v.tenant_id = $1`;
  if (activeOnly) sql += ` AND v.active = true`;
  if (q) {
    params.push(`%${q}%`);
    sql += ` AND (v.plate ILIKE $${params.length} OR v.make ILIKE $${params.length} OR v.model ILIKE $${params.length})`;
  }
  sql += ` ORDER BY v.plate`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(`SELECT * FROM vehicles WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}

export function create(tenantId, d) {
  return query(
    `INSERT INTO vehicles (tenant_id, plate, make, model, year, rentalsyst_id)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [tenantId, d.plate, d.make, d.model, d.year, d.rentalsyst_id || null],
  ).then((r) => r.rows[0]);
}

export function update(tenantId, id, d) {
  return query(
    `UPDATE vehicles SET
       plate = COALESCE($3, plate), make = COALESCE($4, make),
       model = COALESCE($5, model), year = COALESCE($6, year),
       rentalsyst_id = COALESCE($7, rentalsyst_id)
     WHERE tenant_id = $1 AND id = $2 RETURNING *`,
    [tenantId, id, d.plate ?? null, d.make ?? null, d.model ?? null, d.year ?? null, d.rentalsyst_id ?? null],
  ).then((r) => r.rows[0]);
}

export function softDelete(tenantId, id) {
  return query(`UPDATE vehicles SET active = false WHERE tenant_id = $1 AND id = $2 RETURNING id`, [
    tenantId,
    id,
  ]).then((r) => r.rows[0]);
}

export function amortization(tenantId, id) {
  return query(`SELECT * FROM vehicle_amortization_progress WHERE tenant_id = $1 AND id = $2`, [
    tenantId,
    id,
  ]).then((r) => r.rows);
}
export function plansFor(tenantId, id) {
  return query(
    `SELECT ap.*, c.name AS company_name FROM amortization_plans ap
     JOIN companies c ON c.id = ap.company_id
     WHERE ap.tenant_id = $1 AND ap.vehicle_id = $2 ORDER BY ap.id DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function pnl(tenantId, id) {
  return query(
    `SELECT * FROM vehicle_pnl WHERE tenant_id = $1 AND vehicle_id = $2 AND month IS NOT NULL ORDER BY month DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function expenses(tenantId, id) {
  return query(
    `SELECT * FROM invoices WHERE tenant_id = $1 AND vehicle_id = $2 ORDER BY due_date DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function incomeRows(tenantId, id) {
  return query(
    `SELECT * FROM vehicle_income WHERE tenant_id = $1 AND vehicle_id = $2 ORDER BY month DESC`,
    [tenantId, id],
  ).then((r) => r.rows);
}
export function upsertIncome(tenantId, vehicleId, { month, amount, days_rented, currency }) {
  return query(
    `INSERT INTO vehicle_income (tenant_id, vehicle_id, month, amount, days_rented, currency)
     VALUES ($1,$2,date_trunc('month',$3::date),$4,$5,$6)
     ON CONFLICT (tenant_id, vehicle_id, month)
     DO UPDATE SET amount = EXCLUDED.amount, days_rented = EXCLUDED.days_rented, currency = EXCLUDED.currency
     RETURNING *`,
    [tenantId, vehicleId, month, amount, days_rented, currency],
  ).then((r) => r.rows[0]);
}
