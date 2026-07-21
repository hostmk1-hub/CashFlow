import { ApiError } from '../../shared/http.js';
import * as repo from './repository.js';

export const list = (tenantId, filters) => repo.list(tenantId, filters);
export async function getById(tenantId, id) {
  const w = await repo.getById(tenantId, id);
  if (!w) throw new ApiError(404, 'Worker not found');
  return w;
}
export const create = (tenantId, d) => repo.create(tenantId, d);
export async function update(tenantId, id, d) {
  const w = await repo.update(tenantId, id, d);
  if (!w) throw new ApiError(404, 'Worker not found');
  return w;
}
export async function remove(tenantId, id) {
  const d = await repo.softDelete(tenantId, id);
  if (!d) throw new ApiError(404, 'Worker not found');
  return { id: d.id };
}
export async function detail(tenantId, id) {
  const worker = await getById(tenantId, id);
  return {
    worker,
    salaries: await repo.salaryHistory(tenantId, id),
    payments: await repo.paymentHistory(tenantId, id),
  };
}
