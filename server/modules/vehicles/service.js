import { ApiError } from '../../shared/http.js';
import { toMkd } from '../../shared/currency.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const v = await repo.getById(tenantId, id);
  if (!v) throw new ApiError(404, 'Vehicle not found');
  return v;
}

export const create = (tenantId, data) => repo.create(tenantId, data);

export async function update(tenantId, id, data) {
  const v = await repo.update(tenantId, id, data);
  if (!v) throw new ApiError(404, 'Vehicle not found');
  return v;
}

export async function remove(tenantId, id) {
  const d = await repo.softDelete(tenantId, id);
  if (!d) throw new ApiError(404, 'Vehicle not found');
  return { id: d.id };
}

export async function detail(tenantId, id) {
  const vehicle = await getById(tenantId, id);
  return {
    vehicle,
    plans: await repo.plansFor(tenantId, id),
    amortization: await repo.amortization(tenantId, id),
    expenses: await repo.expenses(tenantId, id),
    income: await repo.incomeRows(tenantId, id),
    pnl: await repo.pnl(tenantId, id),
  };
}

export const amortization = (tenantId, id) => repo.amortization(tenantId, id);
export const pnl = (tenantId, id) => repo.pnl(tenantId, id);

export async function setIncome(tenantId, id, input) {
  await getById(tenantId, id); // ensure exists
  const { amount, currency } = toMkd({
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchange_rate,
  });
  return repo.upsertIncome(tenantId, id, {
    month: input.month,
    amount,
    days_rented: input.days_rented,
    currency,
  });
}
