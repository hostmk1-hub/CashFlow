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
        (tenant_id, company_id, worker_id, amount, method, currency, original_amount, exchange_rate, note, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, COALESCE($10, CURRENT_DATE)) RETURNING *`,
      [tenantId, p.companyId || null, p.workerId || null, p.amount, p.method, p.currency,
       p.originalAmount || null, p.exchangeRate || 1, p.note || null, p.paidAt || null],
    )
    .then((r) => r.rows[0]);
}

// Lock a payment row for editing so its re-allocation is race-free.
export function lockPayment(client, tenantId, id) {
  return client
    .query(`SELECT * FROM payments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, id])
    .then((r) => r.rows[0]);
}

export function allocationsForUpdate(client, paymentId) {
  return client
    .query(`SELECT id, invoice_id, amount FROM payment_allocations WHERE payment_id = $1`, [paymentId])
    .then((r) => r.rows);
}

// Lock specific invoices (by id) for this tenant, for re-allocation.
export function lockInvoicesByIds(client, tenantId, invoiceIds) {
  if (!invoiceIds.length) return Promise.resolve([]);
  return client
    .query(
      `SELECT id, amount, paid_amount, due_date, description
       FROM invoices WHERE tenant_id = $1 AND id = ANY($2)
       ORDER BY due_date ASC, id ASC FOR UPDATE`,
      [tenantId, invoiceIds],
    )
    .then((r) => r.rows);
}

// Undo one allocation's effect on its invoice (subtract, recompute status).
export function reverseAllocationOnInvoice(client, invoiceId, allocAmount) {
  return client.query(
    `UPDATE invoices
       SET paid_amount = GREATEST(0, paid_amount - $2),
           status = CASE
             WHEN GREATEST(0, paid_amount - $2) <= 0.001 THEN 'open'::invoice_status
             WHEN GREATEST(0, paid_amount - $2) >= amount - 0.001 THEN 'paid'::invoice_status
             ELSE 'partial'::invoice_status END
     WHERE id = $1`,
    [invoiceId, allocAmount],
  );
}

export function deleteAllocations(client, paymentId) {
  return client.query(`DELETE FROM payment_allocations WHERE payment_id = $1`, [paymentId]);
}

export function updatePaymentFields(client, tenantId, id, f) {
  return client
    .query(
      `UPDATE payments SET
         amount  = COALESCE($3, amount),
         method  = COALESCE($4, method),
         paid_at = COALESCE($5, paid_at),
         note    = COALESCE($6, note)
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, id, f.amount ?? null, f.method ?? null, f.paidAt ?? null, f.note === undefined ? null : f.note],
    )
    .then((r) => r.rows[0]);
}

export function getPayment(tenantId, id) {
  return query(`SELECT * FROM payments WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then((r) => r.rows[0]);
}

export function setProofUrl(tenantId, id, proofUrl) {
  return query(`UPDATE payments SET proof_url = $3 WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
    tenantId, id, proofUrl,
  ]).then((r) => r.rows[0]);
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
