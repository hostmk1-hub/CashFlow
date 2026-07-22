import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import * as repo from './repository.js';
import * as paymentService from '../payments/service.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const invoice = await repo.getById(tenantId, id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  const allocations = await repo.allocations(tenantId, id);
  return { ...invoice, allocations };
}

/**
 * Pay a SPECIFIC invoice directly (bypasses FIFO): records a payment allocated
 * only to this invoice. Defaults to the full remaining amount; pass `amount`
 * (e.g. one installment) for a partial payment. Marks it paid when fully settled.
 */
export async function payInvoice(tenantId, invoiceId, { amount, method = 'bank' } = {}) {
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
