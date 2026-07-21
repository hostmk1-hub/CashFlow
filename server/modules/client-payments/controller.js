import { clientPaymentPreviewSchema, createClientPaymentSchema } from '../../schemas/clientInvoices.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const preview = asyncHandler(async (req, res) =>
  res.json(await service.preview(req.tenantId, clientPaymentPreviewSchema.parse(req.body))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createClientPaymentSchema.parse(req.body))),
);
export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, req.query.company_id ? Number(req.query.company_id) : undefined)),
);
