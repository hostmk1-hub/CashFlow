import multer from 'multer';
import { amortizationSchema, scannedInvoiceDraftSchema } from '../../schemas/misc.js';
import { asyncHandler } from '../../shared/http.js';
import { scanAmortization } from '../scanner/service.js';
import * as service from './service.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, amortizationSchema.parse(req.body))),
);

export const confirm = asyncHandler(async (req, res) =>
  res.status(201).json(await service.confirm(req.tenantId, amortizationSchema.parse(req.body))),
);

// Gemini Vision scan → returns an editable draft, nothing saved.
export const scan = asyncHandler(async (req, res) => {
  const draft = await scanAmortization(req.tenantId, req.file);
  res.json(draft);
});
