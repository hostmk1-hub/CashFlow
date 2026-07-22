import { createInvoiceSchema, invoiceFiltersSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) => {
  const filters = invoiceFiltersSchema.parse(req.query);
  res.json(await service.list(req.tenantId, filters));
});
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, Number(req.params.id))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createInvoiceSchema.parse(req.body))),
);
export const payInvoice = asyncHandler(async (req, res) =>
  res.status(201).json(await service.payInvoice(req.tenantId, Number(req.params.id), {
    amount: req.body.amount, method: req.body.method,
  })),
);
