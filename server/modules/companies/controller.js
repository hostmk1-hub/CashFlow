import { createCompanySchema, updateCompanySchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) => {
  const { type, category, q } = req.query;
  res.json(await service.list(req.tenantId, { type, category, q }));
});

export const getById = asyncHandler(async (req, res) => {
  res.json(await service.getById(req.tenantId, Number(req.params.id)));
});

export const create = asyncHandler(async (req, res) => {
  const data = createCompanySchema.parse(req.body);
  res.status(201).json(await service.create(req.tenantId, data));
});

export const update = asyncHandler(async (req, res) => {
  const data = updateCompanySchema.parse(req.body);
  res.json(await service.update(req.tenantId, Number(req.params.id), data));
});

export const remove = asyncHandler(async (req, res) => {
  res.json(await service.remove(req.tenantId, Number(req.params.id)));
});

export const ledger = asyncHandler(async (req, res) => {
  res.json(await service.ledger(req.tenantId, Number(req.params.id)));
});

export const installments = asyncHandler(async (req, res) => {
  res.json(await service.installments(req.tenantId, Number(req.params.id)));
});
