import { query } from '../../shared/db.js';

export function insert({ tenantId, userId, action, entityType, entityId, summary, details }) {
  return query(
    `INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, summary, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
    [tenantId, userId ?? null, action, entityType ?? null, entityId ?? null, summary ?? null, details ? JSON.stringify(details) : null],
  ).then((r) => r.rows[0]);
}

export function list(tenantId, { limit = 100, entityType, entityId, action } = {}) {
  const params = [tenantId];
  let sql = `SELECT a.*, u.name AS user_name, u.email AS user_email
             FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
             WHERE a.tenant_id = $1`;
  if (entityType) { params.push(entityType); sql += ` AND a.entity_type = $${params.length}`; }
  if (entityId) { params.push(entityId); sql += ` AND a.entity_id = $${params.length}`; }
  if (action) { params.push(`${action}%`); sql += ` AND a.action LIKE $${params.length}`; }
  params.push(Math.min(Number(limit) || 100, 500));
  sql += ` ORDER BY a.created_at DESC, a.id DESC LIMIT $${params.length}`;
  return query(sql, params).then((r) => r.rows);
}
