import { createVehicleSchema, updateVehicleSchema, vehicleIncomeInputSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.tenantId, { q: req.query.q, activeOnly: req.query.active === 'true' }));
});
export const getById = asyncHandler(async (req, res) => {
  res.json(await service.detail(req.tenantId, Number(req.params.id)));
});
export const create = asyncHandler(async (req, res) => {
  res.status(201).json(await service.create(req.tenantId, createVehicleSchema.parse(req.body)));
});
export const update = asyncHandler(async (req, res) => {
  res.json(await service.update(req.tenantId, Number(req.params.id), updateVehicleSchema.parse(req.body)));
});
export const remove = asyncHandler(async (req, res) => {
  res.json(await service.remove(req.tenantId, Number(req.params.id)));
});
export const amortization = asyncHandler(async (req, res) => {
  res.json(await service.amortization(req.tenantId, Number(req.params.id)));
});
export const installments = asyncHandler(async (req, res) => {
  res.json(await service.installments(req.tenantId, Number(req.params.id)));
});
export const pnl = asyncHandler(async (req, res) => {
  res.json(await service.pnl(req.tenantId, Number(req.params.id)));
});
export const setIncome = asyncHandler(async (req, res) => {
  const data = vehicleIncomeInputSchema.parse(req.body);
  res.status(201).json(await service.setIncome(req.tenantId, Number(req.params.id), data));
});
