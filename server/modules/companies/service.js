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
