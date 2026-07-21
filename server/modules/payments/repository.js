import { query } from '../../shared/db.js';

/**
 * Open invoices for a company/worker, oldest due_date first, locked FOR UPDATE
 * so two concurrent payments can't double-allocate the same invoice.
 */
export function lockOpenInvoices(client, tenantId, { companyId, workerId, invoiceIds }) {
  const params = [tenantId];
  let sql = `SELECT id, amount, paid_amount, due_date, description
             FROM invoices
             WHERE tenant_id = $1 AND status != 'paid'`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND company_id = $${params.length}`;
  }
  if (workerId) {
    params.push(workerId);
    sql += ` AND worker_id = $${params.length}`;
  }
  if (invoiceIds && invoiceIds.length) {
    params.push(invoiceIds);
    sql += ` AND id = ANY($${params.length})`;
  }
  sql += ` ORDER BY due_date ASC, id ASC FOR UPDATE`;
  return client.query(sql, params).then((r) => r.rows);
}

// Read-only variant for previews (no lock, no transaction needed).
export function openInvoices(tenantId, { companyId, workerId }) {
  const params = [tenantId];
  let sql = `SELECT id, amount, paid_amount, due_date, description, currency, original_amount
             FROM invoices WHERE tenant_id = $1 AND status != 'paid'`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND company_id = $${params.length}`;
  }
  if (workerId) {
    params.push(workerId);
    sql += ` AND worker_id = $${params.length}`;
  }
  sql += ` ORDER BY due_date ASC, id ASC`;
  return query(sql, params).then((r) => r.rows);
}

export function insertPayment(client, tenantId, p) {
  return client
    .query(
      `INSERT INTO payments
        (tenant_id, company_id, worker_id, amount, method, currency, original_amount, exchange_rate, note)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [tenantId, p.companyId || null, p.workerId || null, p.amount, p.method, p.currency,
       p.originalAmount || null, p.exchangeRate || 1, p.note || null],
    )
    .then((r) => r.rows[0]);
}

export function applyAllocation(client, { paymentId, invoiceId, amount, newPaid, newStatus }) {
  return Promise.all([
    client.query(
      `INSERT INTO payment_allocations (payment_id, invoice_id, amount) VALUES ($1,$2,$3)`,
      [paymentId, invoiceId, amount],
    ),
    client.query(`UPDATE invoices SET paid_amount = $2, status = $3 WHERE id = $1`, [
      invoiceId, newPaid, newStatus,
    ]),
  ]);
}

export function list(tenantId, { companyId, workerId } = {}) {
  const params = [tenantId];
  let sql = `SELECT p.*, c.name AS company_name, w.name AS worker_name
             FROM payments p
             LEFT JOIN companies c ON c.id = p.company_id
             LEFT JOIN workers w ON w.id = p.worker_id
             WHERE p.tenant_id = $1`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND p.company_id = $${params.length}`;
  }
  if (workerId) {
    params.push(workerId);
    sql += ` AND p.worker_id = $${params.length}`;
  }
  sql += ` ORDER BY p.paid_at DESC, p.id DESC`;
  return query(sql, params).then((r) => r.rows);
}

export function allocationsForPayment(tenantId, paymentId) {
  return query(
    `SELECT pa.*, i.description, i.invoice_number FROM payment_allocations pa
     JOIN invoices i ON i.id = pa.invoice_id
     WHERE pa.payment_id = $1 AND i.tenant_id = $2`,
    [paymentId, tenantId],
  ).then((r) => r.rows);
}
