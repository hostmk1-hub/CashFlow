import { query } from '../../shared/db.js';

export function findUserByEmail(email) {
  return query(`SELECT * FROM users WHERE lower(email) = lower($1)`, [email]).then((r) => r.rows[0]);
}

export function findUserById(id) {
  return query(`SELECT id, email, name, active, created_at FROM users WHERE id = $1`, [id]).then(
    (r) => r.rows[0],
  );
}

export function createUser(client, { email, passwordHash, name }) {
  return client
    .query(
      `INSERT INTO users (email, password_hash, name) VALUES ($1,$2,$3) RETURNING id, email, name`,
      [email, passwordHash, name || null],
    )
    .then((r) => r.rows[0]);
}

export function createTenant(client, { name, slug }) {
  return client
    .query(`INSERT INTO tenants (name, slug) VALUES ($1,$2) RETURNING *`, [name, slug])
    .then((r) => r.rows[0]);
}

export function addTenantUser(client, { tenantId, userId, role }) {
  return client
    .query(
      `INSERT INTO tenant_users (tenant_id, user_id, role) VALUES ($1,$2,$3)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role RETURNING *`,
      [tenantId, userId, role],
    )
    .then((r) => r.rows[0]);
}

export function listUserTenants(userId) {
  return query(
    `SELECT t.id, t.name, t.slug, t.active, tu.role
     FROM tenant_users tu JOIN tenants t ON t.id = tu.tenant_id
     WHERE tu.user_id = $1 AND t.active = true
     ORDER BY t.name`,
    [userId],
  ).then((r) => r.rows);
}

export function getMembership(tenantId, userId) {
  return query(`SELECT role FROM tenant_users WHERE tenant_id = $1 AND user_id = $2`, [
    tenantId,
    userId,
  ]).then((r) => r.rows[0]);
}
