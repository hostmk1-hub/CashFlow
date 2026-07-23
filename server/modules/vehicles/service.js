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

const r2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
// A future month is 'upcoming'; this month/overdue & unpaid is 'due'.
function rowStatus(paid, monthStr) {
  if (paid) return 'paid';
  const d = new Date(monthStr);
  const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
  return endOfMonth <= new Date() ? 'due' : 'upcoming';
}

/** The vehicle's lease installments with paid / due / upcoming status + totals. */
export async function installments(tenantId, vehicleId) {
  await getById(tenantId, vehicleId);
  const invs = await repo.amortInvoices(tenantId, vehicleId);
  const rows = invs.map((inv) => {
    const paid = inv.status === 'paid';
    return {
      invoiceId: inv.id,
      label: inv.description,
      month: inv.due_date,
      amount: Number(inv.amount),
      paid_amount: Number(inv.paid_amount),
      remaining: Number(inv.remaining),
      paid,
      status: rowStatus(paid, inv.due_date),
      last_payment_id: inv.last_payment_id || null,
    };
  });
  return {
    rows,
    totalDueNow: r2(rows.filter((r) => r.status === 'due').reduce((t, r) => t + r.remaining, 0)),
    totalUpcoming: r2(rows.filter((r) => r.status === 'upcoming').reduce((t, r) => t + r.remaining, 0)),
    totalPaid: r2(rows.filter((r) => r.paid).reduce((t, r) => t + r.paid_amount, 0)),
    count: rows.length,
  };
}

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
