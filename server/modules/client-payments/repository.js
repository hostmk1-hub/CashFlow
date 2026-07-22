import { query } from '../../shared/db.js';

export function openClientInvoices(tenantId, companyId) {
  return query(
    `SELECT id, amount, paid_amount, due_date, description
     FROM client_invoices
     WHERE tenant_id = $1 AND company_id = $2 AND status NOT IN ('draft','paid','cancelled')
     ORDER BY due_date ASC, id ASC`,
    [tenantId, companyId],
  ).then((r) => r.rows);
}

export function lockOpenClientInvoices(client, tenantId, companyId) {
  return client
    .query(
      `SELECT id, amount, paid_amount, due_date, description
       FROM client_invoices
       WHERE tenant_id = $1 AND company_id = $2 AND status NOT IN ('draft','paid','cancelled')
       ORDER BY due_date ASC, id ASC FOR UPDATE`,
      [tenantId, companyId],
    )
    .then((r) => r.rows);
}

export function insertPayment(client, tenantId, p) {
  return client
    .query(
      `INSERT INTO client_payments
        (tenant_id, company_id, amount, method, currency, original_amount, exchange_rate, note, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8, COALESCE($9, CURRENT_DATE)) RETURNING *`,
      [tenantId, p.companyId, p.amount, p.method, p.currency, p.originalAmount || null,
       p.exchangeRate || 1, p.note || null, p.paidAt || null],
    )
    .then((r) => r.rows[0]);
}

export function getPayment(tenantId, id) {
  return query(`SELECT * FROM client_payments WHERE tenant_id = $1 AND id = $2`, [tenantId, id]).then(
    (r) => r.rows[0],
  );
}

export function setProofUrl(tenantId, id, proofUrl) {
  return query(`UPDATE client_payments SET proof_url = $3 WHERE tenant_id = $1 AND id = $2 RETURNING *`, [
    tenantId, id, proofUrl,
  ]).then((r) => r.rows[0]);
}

export function applyAllocation(client, { clientPaymentId, clientInvoiceId, amount, newPaid, newStatus }) {
  return Promise.all([
    client.query(
      `INSERT INTO client_payment_allocations (client_payment_id, client_invoice_id, amount)
       VALUES ($1,$2,$3)`,
      [clientPaymentId, clientInvoiceId, amount],
    ),
    client.query(`UPDATE client_invoices SET paid_amount = $2, status = $3 WHERE id = $1`, [
      clientInvoiceId, newPaid, newStatus,
    ]),
  ]);
}

export function lockPayment(client, tenantId, id) {
  return client
    .query(`SELECT * FROM client_payments WHERE tenant_id = $1 AND id = $2 FOR UPDATE`, [tenantId, id])
    .then((r) => r.rows[0]);
}

export function allocationsForUpdate(client, paymentId) {
  return client
    .query(`SELECT client_invoice_id, amount FROM client_payment_allocations WHERE client_payment_id = $1`, [paymentId])
    .then((r) => r.rows);
}

// Undo one allocation on its client invoice (subtract, recompute status).
export function reverseAllocationOnInvoice(client, invoiceId, allocAmount) {
  return client.query(
    `UPDATE client_invoices
       SET paid_amount = GREATEST(0, paid_amount - $2),
           status = CASE
             WHEN GREATEST(0, paid_amount - $2) <= 0.001 THEN 'sent'
             WHEN GREATEST(0, paid_amount - $2) >= amount - 0.001 THEN 'paid'
             ELSE 'partial' END
     WHERE id = $1`,
    [invoiceId, allocAmount],
  );
}

export function deleteAllocations(client, paymentId) {
  return client.query(`DELETE FROM client_payment_allocations WHERE client_payment_id = $1`, [paymentId]);
}

export function deletePayment(client, tenantId, id) {
  return client
    .query(`DELETE FROM client_payments WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id])
    .then((r) => r.rows[0]);
}

export function list(tenantId, companyId) {
  const params = [tenantId];
  let sql = `SELECT cp.*, c.name AS company_name FROM client_payments cp
             JOIN companies c ON c.id = cp.company_id WHERE cp.tenant_id = $1`;
  if (companyId) {
    params.push(companyId);
    sql += ` AND cp.company_id = $${params.length}`;
  }
  sql += ` ORDER BY cp.paid_at DESC, cp.id DESC`;
  return query(sql, params).then((r) => r.rows);
}
