import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const invoice = await repo.getById(tenantId, id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  const allocations = await repo.allocations(tenantId, id);
  return { ...invoice, allocations };
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
