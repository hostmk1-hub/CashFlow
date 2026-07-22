import { ApiError } from '../../shared/http.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);

export async function getById(tenantId, id) {
  const company = await repo.getById(tenantId, id);
  if (!company) throw new ApiError(404, 'Company not found');
  return company;
}

export const create = (tenantId, data) => repo.create(tenantId, data);

export async function update(tenantId, id, data) {
  const updated = await repo.update(tenantId, id, data);
  if (!updated) throw new ApiError(404, 'Company not found');
  return updated;
}

export async function remove(tenantId, id) {
  const deleted = await repo.softDelete(tenantId, id);
  if (!deleted) throw new ApiError(404, 'Company not found');
  return { id: deleted.id };
}

function addMonths(dateStr, n) {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0, 10);
}

/**
 * Monthly installment schedule for what you owe this company: expands both
 * amortization lease installments (one invoice per month) and single-invoice
 * installment plans (count + monthly amount) into month-by-month rows, each
 * marked paid/unpaid, so you can see which month owes how much and settle it.
 */
export async function installments(tenantId, id) {
  const invoices = await repo.installmentInvoices(tenantId, id);
  const rows = [];
  for (const inv of invoices) {
    if (inv.installment_count && inv.installment_count > 1) {
      const per = Number(inv.installment_amount) || 0;
      const paidCount = per > 0 ? Math.floor(Number(inv.paid_amount) / per) : 0;
      for (let k = 0; k < inv.installment_count; k++) {
        rows.push({
          invoiceId: inv.id,
          kind: 'plan-installment',
          month: addMonths(inv.due_date, k),
          label: `${inv.description} · ${k + 1}/${inv.installment_count}`,
          amount: per,
          paid: k < paidCount,
        });
      }
    } else {
      rows.push({
        invoiceId: inv.id,
        kind: 'invoice',
        month: inv.due_date,
        label: inv.description,
        amount: Number(inv.amount),
        remaining: Number(inv.remaining),
        paid: inv.status === 'paid',
      });
    }
  }
  rows.sort((a, b) => new Date(a.month) - new Date(b.month));
  const totalDue = rows.filter((r) => !r.paid).reduce((s, r) => s + r.amount, 0);
  const totalPaid = rows.filter((r) => r.paid).reduce((s, r) => s + r.amount, 0);
  return { rows, totalDue, totalPaid, count: rows.length };
}

export async function ledger(tenantId, id) {
  const company = await getById(tenantId, id);
  const payables = await repo.balances(tenantId, id);
  const result = {
    company,
    payables: {
      totals: payables || { total_invoiced: 0, total_paid: 0, open_balance: 0 },
      invoices: await repo.invoiceHistory(tenantId, id),
      payments: await repo.paymentHistory(tenantId, id),
    },
    linkedVehicles: await repo.linkedVehicles(tenantId, id),
  };
  if (company.type === 'client' || company.type === 'both') {
    result.receivables = {
      totals: (await repo.clientBalances(tenantId, id)) || {
        total_billed: 0,
        total_received: 0,
        outstanding_balance: 0,
      },
      invoices: await repo.clientInvoiceHistory(tenantId, id),
      payments: await repo.clientPaymentHistory(tenantId, id),
    };
  }
  return result;
}
