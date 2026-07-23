import { query } from '../../shared/db.js';

export function list(tenantId, f = {}) {
  const params = [tenantId];
  let sql = `SELECT ci.*, c.name AS company_name, c.tax_number AS company_tax_number,
                    v.plate AS vehicle_plate
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
  if (f.search) {
    params.push(`%${f.search}%`);
    sql += ` AND (c.name ILIKE $${params.length} OR ci.invoice_number ILIKE $${params.length})`;
  }
  sql += ` ORDER BY ci.issue_date DESC, ci.id DESC`;
  return query(sql, params).then((r) => r.rows);
}

export function getById(tenantId, id) {
  return query(
    `SELECT ci.*, c.name AS company_name, c.tax_number AS company_tax_number,
            c.address AS company_address, c.email AS company_email, c.phone AS company_phone,
            v.plate AS vehicle_plate
     FROM client_invoices ci
     JOIN companies c ON c.id = ci.company_id
     LEFT JOIN vehicles v ON v.id = ci.vehicle_id
     WHERE ci.tenant_id = $1 AND ci.id = $2`,
    [tenantId, id],
  ).then((r) => r.rows[0]);
}

export function itemsFor(tenantId, invoiceId) {
  return query(
    `SELECT * FROM client_invoice_items WHERE tenant_id = $1 AND client_invoice_id = $2 ORDER BY position, id`,
    [tenantId, invoiceId],
  ).then((r) => r.rows);
}

/**
 * Next sequential number as YY-NNNN (2-digit year + zero-padded sequence, reset
 * per year), matching the sample (e.g. 23-0033). Runs inside the create txn so
 * concurrent creates don't collide.
 */
export async function nextInvoiceNumber(client, tenantId) {
  const yy = String(new Date().getFullYear()).slice(-2);
  const { rows } = await client.query(
    `SELECT COALESCE(MAX(NULLIF(regexp_replace(split_part(invoice_number,'-',2),'\\D','','g'),'')::int),0) AS n
     FROM client_invoices
     WHERE tenant_id = $1 AND invoice_number LIKE $2`,
    [tenantId, `${yy}-%`],
  );
  const seq = String((rows[0]?.n || 0) + 1).padStart(4, '0');
  return `${yy}-${seq}`;
}

export function numberExists(tenantId, invoiceNumber, exceptId = 0) {
  return query(
    `SELECT 1 FROM client_invoices WHERE tenant_id = $1 AND invoice_number = $2 AND id <> $3 LIMIT 1`,
    [tenantId, invoiceNumber, exceptId],
  ).then((r) => r.rows.length > 0);
}

export function insertHeader(client, tenantId, d) {
  return client
    .query(
      `INSERT INTO client_invoices
        (tenant_id, company_id, vehicle_id, invoice_number, description, amount, paid_amount, currency,
         original_amount, exchange_rate, issue_date, due_date, status,
         vat_enabled, vat_rate, net_amount, vat_amount, amount_in_words, notes, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) RETURNING *`,
      [
        tenantId, d.company_id, d.vehicle_id || null, d.invoice_number, d.description, d.amount, d.paid_amount || 0,
        d.currency, d.original_amount ?? null, d.exchange_rate || 1, d.issue_date, d.due_date, d.status,
        d.vat_enabled, d.vat_rate, d.net_amount, d.vat_amount, d.amount_in_words, d.notes ?? null, d.paid_at ?? null,
      ],
    )
    .then((r) => r.rows[0]);
}

export function updateHeader(client, tenantId, id, d) {
  return client
    .query(
      `UPDATE client_invoices SET
         company_id = $3, vehicle_id = $4, invoice_number = $5, description = $6, amount = $7,
         currency = $8, original_amount = $9, exchange_rate = $10, issue_date = $11, due_date = $12,
         status = $13, vat_enabled = $14, vat_rate = $15, net_amount = $16, vat_amount = $17,
         amount_in_words = $18, notes = $19, paid_at = $20, paid_amount = COALESCE($21, paid_amount)
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [
        tenantId, id, d.company_id, d.vehicle_id || null, d.invoice_number, d.description, d.amount,
        d.currency, d.original_amount ?? null, d.exchange_rate || 1, d.issue_date, d.due_date,
        d.status, d.vat_enabled, d.vat_rate, d.net_amount, d.vat_amount, d.amount_in_words, d.notes ?? null,
        d.paid_at ?? null, d.paid_amount ?? null,
      ],
    )
    .then((r) => r.rows[0]);
}

export function deleteItems(client, tenantId, invoiceId) {
  return client.query(`DELETE FROM client_invoice_items WHERE tenant_id = $1 AND client_invoice_id = $2`, [
    tenantId, invoiceId,
  ]);
}

export function insertItem(client, tenantId, invoiceId, it) {
  return client.query(
    `INSERT INTO client_invoice_items
       (tenant_id, client_invoice_id, position, description, quantity, unit_price, vat_rate, vat_amount, total)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [tenantId, invoiceId, it.position, it.description, it.quantity, it.unit_price, it.vat_rate, it.vat_amount, it.total],
  );
}

export function setStatus(client, tenantId, id, status, paidAt, paidAmount) {
  return client
    .query(
      `UPDATE client_invoices SET status = $3, paid_at = $4, paid_amount = COALESCE($5, paid_amount)
       WHERE tenant_id = $1 AND id = $2 RETURNING *`,
      [tenantId, id, status, paidAt, paidAmount],
    )
    .then((r) => r.rows[0]);
}

export function hasAllocations(tenantId, invoiceId) {
  return query(
    `SELECT 1 FROM client_payment_allocations cpa JOIN client_payments cp ON cp.id = cpa.client_payment_id
     WHERE cpa.client_invoice_id = $1 AND cp.tenant_id = $2 LIMIT 1`,
    [invoiceId, tenantId],
  ).then((r) => r.rows.length > 0);
}

export function remove(client, tenantId, id) {
  return client
    .query(`DELETE FROM client_invoices WHERE tenant_id = $1 AND id = $2 RETURNING id`, [tenantId, id])
    .then((r) => r.rows[0]);
}
