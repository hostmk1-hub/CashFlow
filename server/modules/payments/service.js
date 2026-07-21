import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import * as repo from './repository.js';

/**
 * Given a list of open invoices (oldest first) and an MKD amount, compute how
 * that amount would be allocated FIFO. Pure function — no DB writes.
 */
function planAllocation(invoices, amountMkd) {
  let remaining = round2(amountMkd);
  const allocations = [];
  for (const inv of invoices) {
    if (remaining <= 0) break;
    const owed = round2(Number(inv.amount) - Number(inv.paid_amount));
    if (owed <= 0) continue;
    const applied = Math.min(remaining, owed);
    const newPaid = round2(Number(inv.paid_amount) + applied);
    const fullyPaid = newPaid >= Number(inv.amount) - 0.001;
    allocations.push({
      invoiceId: inv.id,
      description: inv.description,
      owedBefore: owed,
      applied: round2(applied),
      newPaid,
      newStatus: fullyPaid ? 'paid' : 'partial',
      closed: fullyPaid,
    });
    remaining = round2(remaining - applied);
  }
  return { allocations, leftover: round2(remaining) };
}

export async function preview(tenantId, input) {
  const { companyId, workerId } = input;
  const { amount: amountMkd } = toMkd({
    amount: input.amount,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
  });
  const invoices = await repo.openInvoices(tenantId, { companyId, workerId });
  const { allocations, leftover } = planAllocation(invoices, amountMkd);
  const totalOpen = round2(invoices.reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount)), 0));
  return {
    amountMkd,
    allocations,
    leftover,
    totalOpenBefore: totalOpen,
    totalOpenAfter: round2(totalOpen - (amountMkd - leftover)),
  };
}

export async function create(tenantId, input) {
  const { companyId, workerId, method, note, invoiceIds } = input;
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchangeRate });

  return withTransaction(async (client) => {
    const invoices = await repo.lockOpenInvoices(client, tenantId, { companyId, workerId, invoiceIds });
    if (!invoices.length) throw new ApiError(400, 'No open invoices to pay');

    const { allocations, leftover } = planAllocation(invoices, money.amount);
    if (!allocations.length) throw new ApiError(400, 'Payment could not be allocated to any invoice');

    const payment = await repo.insertPayment(client, tenantId, {
      companyId, workerId, method, note,
      amount: money.amount, currency: money.currency,
      originalAmount: money.originalAmount, exchangeRate: money.exchangeRate,
    });

    for (const a of allocations) {
      await repo.applyAllocation(client, {
        paymentId: payment.id,
        invoiceId: a.invoiceId,
        amount: a.applied,
        newPaid: a.newPaid,
        newStatus: a.newStatus,
      });
    }

    return {
      payment,
      allocations,
      leftover,
      closed: allocations.filter((a) => a.closed).map((a) => a.invoiceId),
      partial: allocations.filter((a) => !a.closed).map((a) => a.invoiceId),
    };
  });
}

export async function list(tenantId, filters) {
  const rows = await repo.list(tenantId, filters);
  for (const p of rows) {
    p.allocations = await repo.allocationsForPayment(tenantId, p.id);
  }
  return rows;
}
