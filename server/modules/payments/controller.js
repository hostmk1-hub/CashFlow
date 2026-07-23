import multer from 'multer';
import { paymentPreviewSchema, createPaymentSchema, updatePaymentSchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import { logFromReq } from '../audit/service.js';
import { round2 } from '../../shared/currency.js';
import * as service from './service.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

export const preview = asyncHandler(async (req, res) =>
  res.json(await service.preview(req.tenantId, paymentPreviewSchema.parse(req.body))),
);
export const create = asyncHandler(async (req, res) => {
  const result = await service.create(req.tenantId, createPaymentSchema.parse(req.body));
  await logFromReq(req, {
    action: 'payment.create', entityType: 'payment', entityId: result.payment.id,
    summary: `Recorded payment of ${round2(result.payment.amount)} (${result.payment.method})`,
    details: { amount: result.payment.amount, method: result.payment.method, closed: result.closed, partial: result.partial },
  });
  res.status(201).json(result);
});
export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, {
    companyId: req.query.company_id ? Number(req.query.company_id) : undefined,
    workerId: req.query.worker_id ? Number(req.query.worker_id) : undefined,
  })),
);
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, Number(req.params.id))),
);
export const update = asyncHandler(async (req, res) => {
  const patch = updatePaymentSchema.parse(req.body);
  const result = await service.update(req.tenantId, Number(req.params.id), patch);
  await logFromReq(req, {
    action: 'payment.update', entityType: 'payment', entityId: Number(req.params.id),
    summary: `Edited payment #${req.params.id}`, details: patch,
  });
  res.json(result);
});
export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.tenantId, Number(req.params.id));
  await logFromReq(req, {
    action: 'payment.delete', entityType: 'payment', entityId: Number(req.params.id),
    summary: `Deleted (undid) payment #${req.params.id} — invoice balance restored`,
  });
  res.json(result);
});
export const uploadProof = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Attach a proof file (photo or PDF)');
  res.json(await service.attachProof(req.tenantId, Number(req.params.id), req.file));
});
export const downloadProof = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.getProof(req.tenantId, Number(req.params.id));
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});
