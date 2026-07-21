import { ApiError } from '../../shared/http.js';
import { toMkd } from '../../shared/currency.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const invoice = await repo.getById(tenantId, id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  const allocations = await repo.allocations(tenantId, id);
  return { ...invoice, allocations };
}

export async function create(tenantId, input) {
  const { amount, currency, originalAmount, exchangeRate } = toMkd({
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchange_rate,
  });
  return repo.create(tenantId, {
    ...input,
    amount,
    currency,
    original_amount: originalAmount,
    exchange_rate: exchangeRate,
  });
}
