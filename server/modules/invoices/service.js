import { ApiError } from '../../shared/http.js';
import { withTransaction } from '../../shared/db.js';
import { toMkd, round2 } from '../../shared/currency.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const invoice = await repo.getById(tenantId, id);
  if (!invoice) throw new ApiError(404, 'Invoice not found');
  const allocations = await repo.allocations(tenantId, id);
  return { ...invoice, allocations };
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

// Split a total into n parts of round2(total/n), with the last part absorbing
// the rounding remainder so the parts sum back to the exact total.
function splitAmount(total, n) {
  if (total == null) return Array(n).fill(null);
  const per = round2(total / n);
  const arr = Array(n).fill(per);
  arr[n - 1] = round2(total - per * (n - 1));
  return arr;
}

export async function create(tenantId, input) {
  const n = Math.max(1, Math.floor(Number(input.installments) || 1));
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchange_rate });

  // Single invoice — the common case.
  if (n === 1) {
    return repo.create(tenantId, {
      ...input,
      amount: money.amount,
      currency: money.currency,
      original_amount: money.originalAmount,
      exchange_rate: money.exchangeRate,
    });
  }

  // Installment plan: generate n monthly invoices, one per month from due_date.
  const amounts = splitAmount(money.amount, n);
  const origs = splitAmount(money.originalAmount, n);
  return withTransaction(async (client) => {
    const invoices = [];
    for (let k = 0; k < n; k++) {
      const inv = await repo.create(
        tenantId,
        {
          company_id: input.company_id || null,
          worker_id: input.worker_id || null,
          vehicle_id: input.vehicle_id || null,
          invoice_number: input.invoice_number || null,
          description: `${input.description} (${k + 1}/${n})`,
          amount: amounts[k],
          due_date: addMonths(input.due_date, k),
          source: input.source || 'manual',
          currency: money.currency,
          original_amount: origs[k],
          exchange_rate: money.exchangeRate,
        },
        client,
      );
      invoices.push(inv);
    }
    return {
      installments: n,
      total: money.amount,
      perInstallment: amounts[0],
      firstDue: invoices[0].due_date,
      lastDue: invoices[n - 1].due_date,
      invoices,
    };
  });
}
