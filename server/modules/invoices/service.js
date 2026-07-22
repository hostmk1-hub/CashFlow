import path from 'node:path';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import { readScan } from '../../services/fileStorage.js';
import { generateInvoicePdfBuffer } from '../../services/pdfService.js';
import * as repo from './repository.js';
import * as paymentService from '../payments/service.js';

const MIME = { pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif' };

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const invoice = await repo.getById(tenantId, id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  const allocations = await repo.allocations(tenantId, id);
  return { ...invoice, allocations };
}

/**
 * Download an invoice: the attached scan (from the local volume or R2) if there
 * is one, otherwise a generated PDF of the invoice details.
 */
export async function downloadInvoice(tenantId, invoiceId) {
  const inv = await repo.getById(tenantId, invoiceId);
  if (!inv) throw new ApiError(404, 'Invoice not found');
  if (inv.scan_url) {
    const scan = await readScan(inv.scan_url).catch(() => null);
    if (scan) {
      const ext = (path.extname(scan.filename).slice(1) || 'bin').toLowerCase();
      return { buffer: scan.buffer, filename: scan.filename, contentType: MIME[ext] || 'application/octet-stream' };
    }
  }
  const pdf = await generateInvoicePdfBuffer(tenantId, inv);
  return { buffer: pdf, filename: `invoice-${inv.id}.pdf`, contentType: 'application/pdf' };
}

/**
 * Edit an invoice. Recomputes the MKD amount and installment plan, and the
 * paid/partial/open status from the (unchanged) paid_amount. The amount can't
 * drop below what's already been paid.
 */
export async function update(tenantId, id, input) {
  const existing = await repo.getById(tenantId, id);
  if (!existing) throw new ApiError(404, 'Invoice not found');
  const paid = Number(existing.paid_amount);
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchange_rate });
  if (money.amount < paid - 0.001) {
    throw new ApiError(400, `Amount can't be less than the ${round2(paid)} already paid on this invoice.`);
  }
  const n = Math.max(1, Math.floor(Number(input.installments) || 1));
  const status = paid <= 0.001 ? 'open' : paid >= money.amount - 0.001 ? 'paid' : 'partial';
  return repo.update(tenantId, id, {
    company_id: input.company_id ?? null,
    worker_id: input.worker_id ?? null,
    vehicle_id: input.vehicle_id ?? null,
    invoice_number: input.invoice_number ?? null,
    description: input.description,
    amount: money.amount,
    due_date: input.due_date,
    currency: money.currency,
    original_amount: money.originalAmount,
    exchange_rate: money.exchangeRate,
    category: input.category ?? null,
    installment_count: n > 1 ? n : null,
    installment_amount: n > 1 ? round2(money.amount / n) : null,
    status,
  });
}

/**
 * Delete an invoice — but only if nothing has been paid against it. If it has
 * payments, the user must remove those first (so payment history is never
 * silently orphaned).
 */
export async function remove(tenantId, id) {
  const inv = await repo.getById(tenantId, id);
  if (!inv) throw new ApiError(404, 'Invoice not found');
  if (Number(inv.paid_amount) > 0.001 || (await repo.hasAllocations(tenantId, id))) {
    throw new ApiError(409, 'This invoice has payments recorded against it. Delete those payments first, then delete the invoice.');
  }
  await repo.remove(tenantId, id);
  return { ok: true, id: Number(id) };
}

/**
 * Pay a SPECIFIC invoice directly (bypasses FIFO): records a payment allocated
 * only to this invoice. Defaults to the full remaining amount; pass `amount`
 * (e.g. one installment) for a partial payment. Marks it paid when fully settled.
 */
export async function payInvoice(tenantId, invoiceId, { amount, method = 'bank', paidAt } = {}) {
  const inv = await repo.getById(tenantId, invoiceId);
  if (!inv) throw new ApiError(404, 'Invoice not found');
  const remaining = round2(Number(inv.amount) - Number(inv.paid_amount));
  if (remaining <= 0) throw new ApiError(400, 'Invoice is already fully paid');
  const payAmount = amount ? Math.min(round2(Number(amount)), remaining) : remaining;
  return paymentService.create(tenantId, {
    companyId: inv.company_id || undefined,
    workerId: inv.worker_id || undefined,
    amount: payAmount,
    currency: 'MKD',
    method,
    paidAt,
    invoiceIds: [invoiceId],
    note: 'Direct payment for this invoice',
  });
}

/**
 * Create a payables invoice. `installments` > 1 records the supplier's single
 * invoice for the FULL amount and attaches a payment plan (count + per-month
 * amount) so it can be paid down over time — it does NOT split into separate
 * invoices. Progress is tracked by the invoice's paid_amount as partial
 * payments come in, and the company ledger shows exactly how much is still owed.
 */
export async function create(tenantId, input) {
  const n = Math.max(1, Math.floor(Number(input.installments) || 1));
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchange_rate });

  const row = {
    ...input,
    amount: money.amount,
    currency: money.currency,
    original_amount: money.originalAmount,
    exchange_rate: money.exchangeRate,
    installment_count: null,
    installment_amount: null,
  };
  if (n > 1) {
    row.installment_count = n;
    row.installment_amount = round2(money.amount / n); // suggested monthly payment
  }
  return repo.create(tenantId, row);
}
