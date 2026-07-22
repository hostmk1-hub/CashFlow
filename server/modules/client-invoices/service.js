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

export async function update(tenantId, id, input) {
  const existing = await getById(tenantId, id);
  const paid = Number(existing.paid_amount);
  const money = toMkd({
    amount: input.amount ?? existing.amount,
    currency: input.currency ?? existing.currency,
    exchangeRate: input.exchange_rate ?? existing.exchange_rate,
  });
  if (money.amount < paid - 0.001) {
    throw new ApiError(400, `Amount can't be less than the ${paid} already received on this invoice.`);
  }
  // Recompute status from the (unchanged) received amount; keep draft/sent otherwise.
  let status = existing.status;
  if (paid >= money.amount - 0.001 && paid > 0) status = 'paid';
  else if (paid > 0.001) status = 'partial';
  else if (status === 'paid' || status === 'partial') status = 'sent';
  return repo.update(tenantId, id, {
    company_id: input.company_id ?? existing.company_id,
    vehicle_id: input.vehicle_id ?? existing.vehicle_id ?? null,
    description: input.description ?? existing.description,
    amount: money.amount,
    currency: money.currency,
    original_amount: money.originalAmount,
    exchange_rate: money.exchangeRate,
    issue_date: input.issue_date ?? existing.issue_date,
    due_date: input.due_date ?? existing.due_date,
    status,
  });
}

export async function remove(tenantId, id) {
  const ci = await getById(tenantId, id);
  if (Number(ci.paid_amount) > 0.001 || (await repo.hasAllocations(tenantId, id))) {
    throw new ApiError(409, 'This client invoice has payments recorded against it. Delete those payments first.');
  }
  await repo.remove(tenantId, id);
  return { ok: true, id: Number(id) };
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
