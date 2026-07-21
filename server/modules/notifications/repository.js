import { query } from '../../shared/db.js';

export function create({ level = 'info', title, message, context = null }) {
  return query(
    `INSERT INTO system_notifications (level, title, message, context)
     VALUES ($1,$2,$3,$4) RETURNING *`,
    [level, title, message || null, context ? JSON.stringify(context) : null],
  ).then((r) => r.rows[0]);
}

export function listOpen() {
  return query(
    `SELECT * FROM system_notifications WHERE resolved = false ORDER BY created_at DESC LIMIT 50`,
  ).then((r) => r.rows);
}

export function listAll(limit = 100) {
  return query(`SELECT * FROM system_notifications ORDER BY created_at DESC LIMIT $1`, [limit]).then(
    (r) => r.rows,
  );
}

export function resolve(id) {
  return query(`UPDATE system_notifications SET resolved = true WHERE id = $1 RETURNING id`, [id]).then(
    (r) => r.rows[0],
  );
}
