import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd } from '../../shared/currency.js';
import { generateClientInvoicePdf } from '../../services/pdfService.js';
import { query } from '../../shared/db.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const ci = await repo.getById(tenantId, id);
  if (!ci) throw new ApiError(404, 'Client invoice not found');
  return ci;
}

export async function create(tenantId, input) {
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchange_rate });
  return withTransaction(async (client) => {
    const invoice_number = await repo.nextInvoiceNumber(client, tenantId);
    return repo.create(client, tenantId, {
      company_id: input.company_id,
      vehicle_id: input.vehicle_id,
      invoice_number,
      description: input.description,
      amount: money.amount,
      currency: money.currency,
      original_amount: money.originalAmount,
      exchange_rate: money.exchangeRate,
      issue_date: input.issue_date,
      due_date: input.due_date,
      status: input.send ? 'sent' : 'draft',
    });
  });
}

export async function send(tenantId, id) {
  const ci = await getById(tenantId, id);
  if (ci.status === 'cancelled') throw new ApiError(400, 'Cannot send a cancelled invoice');
  const updated = await repo.updateStatus(tenantId, id, 'sent');
  const client = (await query(`SELECT name FROM companies WHERE id = $1`, [ci.company_id])).rows[0];
  // Render a real PDF (tenant letterhead, itemized amount, due date, terms).
  // Emailing it to the client's contact is the next integration point.
  const pdfUrl = await generateClientInvoicePdf(tenantId, updated, client);
  return { invoice: updated, pdfUrl };
}
