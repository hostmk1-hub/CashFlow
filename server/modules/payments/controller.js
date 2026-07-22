import multer from 'multer';
import { paymentPreviewSchema, createPaymentSchema, updatePaymentSchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import * as service from './service.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

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
export const update = asyncHandler(async (req, res) =>
  res.json(await service.update(req.tenantId, Number(req.params.id), updatePaymentSchema.parse(req.body))),
);
export const remove = asyncHandler(async (req, res) =>
  res.json(await service.remove(req.tenantId, Number(req.params.id))),
);
export const uploadProof = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach a proof file (photo or PDF)');
  res.json(await service.attachProof(req.tenantId, Number(req.params.id), req.file));
});
export const downloadProof = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.getProof(req.tenantId, Number(req.params.id));
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});
