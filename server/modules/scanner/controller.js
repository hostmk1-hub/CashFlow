import multer from 'multer';
import { scannedInvoiceDraftSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import * as service from './service.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const scan = asyncHandler(async (req, res) => {
  res.json(await service.scanInvoice(req.tenantId, req.file));
});

export const confirm = asyncHandler(async (req, res) => {
  const draft = scannedInvoiceDraftSchema.parse(req.body);
  // scan_url would be set to the persisted file location (e.g. R2) in production.
  const invoice = await service.confirmInvoice(req.tenantId, draft, req.body.scan_url || null);
  res.status(201).json(invoice);
});
