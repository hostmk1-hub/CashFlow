import { paymentPreviewSchema, createPaymentSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const preview = asyncHandler(async (req, res) =>
  res.json(await service.preview(req.tenantId, paymentPreviewSchema.parse(req.body))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createPaymentSchema.parse(req.body))),
);
export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, {
    companyId: req.query.company_id ? Number(req.query.company_id) : undefined,
    workerId: req.query.worker_id ? Number(req.query.worker_id) : undefined,
  })),
);
