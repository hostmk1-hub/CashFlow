import { withTransaction } from '../../shared/db.js';
import { ApiError } from '../../shared/http.js';
import { toMkd, round2 } from '../../shared/currency.js';
import { saveProof, readProof } from '../../services/fileStorage.js';
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
  const { companyId, workerId, method, note, invoiceIds, paidAt } = input;
  const money = toMkd({ amount: input.amount, currency: input.currency, exchangeRate: input.exchangeRate });

  return withTransaction(async (client) => {
    const invoices = await repo.lockOpenInvoices(client, tenantId, { companyId, workerId, invoiceIds });
    if (!invoices.length) throw new ApiError(400, 'No open invoices to pay');

    const { allocations, leftover } = planAllocation(invoices, money.amount);
    if (!allocations.length) throw new ApiError(400, 'Payment could not be allocated to any invoice');

    const payment = await repo.insertPayment(client, tenantId, {
      companyId, workerId, method, note, paidAt,
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

export async function getById(tenantId, id) {
  const payment = await repo.getPayment(tenantId, id);
  if (!payment) throw new ApiError(404, 'Payment not found');
  payment.allocations = await repo.allocationsForPayment(tenantId, id);
  return payment;
}

/**
 * Edit a payment: method, date and note are simple field updates. Changing the
 * amount is reconciled properly — the old allocations are reversed (restoring
 * each invoice's paid_amount/status), then the NEW amount is re-allocated across
 * the same invoices this payment originally covered (oldest first), so invoice
 * balances stay correct. Leftover (if the new amount exceeds those invoices) is
 * reported.
 */
export async function update(tenantId, paymentId, patch) {
  return withTransaction(async (client) => {
    const payment = await repo.lockPayment(client, tenantId, paymentId);
    if (!payment) throw new ApiError(404, 'Payment not found');

    const changingAmount = patch.amount != null && round2(patch.amount) !== round2(Number(payment.amount));
    let allocations = null;
    let leftover = 0;

    if (changingAmount) {
      const oldAllocs = await repo.allocationsForUpdate(client, paymentId);
      const invoiceIds = [...new Set(oldAllocs.map((a) => a.invoice_id))];
      // Reverse old effect, then wipe allocation rows.
      for (const a of oldAllocs) await repo.reverseAllocationOnInvoice(client, a.invoice_id, Number(a.amount));
      await repo.deleteAllocations(client, paymentId);
      // Re-allocate the new amount over the same (now-reopened) invoices.
      const invoices = await repo.lockInvoicesByIds(client, tenantId, invoiceIds);
      const plan = planAllocation(invoices, round2(patch.amount));
      if (!plan.allocations.length) throw new ApiError(400, 'New amount could not be allocated to this payment’s invoices');
      for (const a of plan.allocations) {
        await repo.applyAllocation(client, {
          paymentId, invoiceId: a.invoiceId, amount: a.applied, newPaid: a.newPaid, newStatus: a.newStatus,
        });
      }
      allocations = plan.allocations;
      leftover = plan.leftover;
    }

    const updated = await repo.updatePaymentFields(client, tenantId, paymentId, {
      amount: changingAmount ? round2(patch.amount) : null,
      method: patch.method ?? null,
      paidAt: patch.paidAt ?? null,
      note: patch.note,
    });
    return { payment: updated, allocations, leftover };
  });
}

/**
 * Delete a payment: reverse its allocations (restoring each invoice's
 * paid_amount and status) inside a transaction, then remove the payment.
 */
export async function remove(tenantId, paymentId) {
  return withTransaction(async (client) => {
    const payment = await repo.lockPayment(client, tenantId, paymentId);
    if (!payment) throw new ApiError(404, 'Payment not found');
    const allocs = await repo.allocationsForUpdate(client, paymentId);
    for (const a of allocs) await repo.reverseAllocationOnInvoice(client, a.invoice_id, Number(a.amount));
    await repo.deleteAllocations(client, paymentId);
    await repo.deletePayment(client, tenantId, paymentId);
    return { ok: true, id: Number(paymentId) };
  });
}

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
