import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import { saveProof, readProof } from '../../services/fileStorage.js';
import * as repo from './repository.js';

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
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchangeRate });
  const invoices = await repo.openClientInvoices(tenantId, input.companyId);
  const { allocations, leftover } = planAllocation(invoices, money.amount);
  const totalOpen = round2(invoices.reduce((s, i) => s + (Number(i.amount) - Number(i.paid_amount)), 0));
  return {
    amountMkd: money.amount,
    allocations,
    leftover,
    totalOpenBefore: totalOpen,
    totalOpenAfter: round2(totalOpen - (money.amount - leftover)),
  };
}

export async function create(tenantId, input) {
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchangeRate });
  return withTransaction(async (client) => {
    const invoices = await repo.lockOpenClientInvoices(client, tenantId, input.companyId);
    if (!invoices.length) throw new ApiError(400, 'No open client invoices to settle');
    const { allocations, leftover } = planAllocation(invoices, money.amount);
    if (!allocations.length) throw new ApiError(400, 'Payment could not be allocated');

    const payment = await repo.insertPayment(client, tenantId, {
      companyId: input.companyId, method: input.method, note: input.note, paidAt: input.paidAt,
      amount: money.amount, currency: money.currency,
      originalAmount: money.originalAmount, exchangeRate: money.exchangeRate,
    });
    for (const a of allocations) {
      await repo.applyAllocation(client, {
        clientPaymentId: payment.id,
        clientInvoiceId: a.invoiceId,
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
    };
  });
}

export const list = (tenantId, companyId) => repo.list(tenantId, companyId);

export async function attachProof(tenantId, paymentId, file) {
  const payment = await repo.getPayment(tenantId, paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  const { proof_url } = await saveProof(tenantId, file);
  return repo.setProofUrl(tenantId, paymentId, proof_url);
}

export async function getProof(tenantId, paymentId) {
  const payment = await repo.getPayment(tenantId, paymentId);
  if (!payment) throw new ApiError(404, 'Payment not found');
  if (!payment.proof_url) throw new ApiError(404, 'No proof of payment attached');
  const file = await readProof(payment.proof_url);
  if (!file) throw new ApiError(404, 'Proof file not found in storage');
  return file;
}
