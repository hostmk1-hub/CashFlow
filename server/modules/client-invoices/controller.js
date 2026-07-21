import { createClientInvoiceSchema, updateClientInvoiceSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, {
    company_id: req.query.company_id ? Number(req.query.company_id) : undefined,
    status: req.query.status,
    date_from: req.query.date_from,
    date_to: req.query.date_to,
  })),
);
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, Number(req.params.id))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createClientInvoiceSchema.parse(req.body))),
);
export const send = asyncHandler(async (req, res) =>
  res.json(await service.send(req.tenantId, Number(req.params.id))),
);
