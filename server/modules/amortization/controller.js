import multer from 'multer';
import { amortizationSchema, updateAmortizationSchema, scheduleAmortizationSchema, scannedInvoiceDraftSchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import { scanAmortization } from '../scanner/service.js';
import { scanPaymentSchedule } from '../../services/geminiService.js';
import { parseSchedule } from './schedule.js';
import * as service from './service.js';

const IMAGE_OR_PDF = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?|pdf)$/i;
function isImageOrPdf(file) {
  const mt = (file.mimetype || '').toLowerCase();
  return mt.startsWith('image/') || mt === 'application/pdf' || IMAGE_OR_PDF.test(file.originalname || '');
}

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, amortizationSchema.parse(req.body))),
);

export const confirm = asyncHandler(async (req, res) =>
  res.status(201).json(await service.confirm(req.tenantId, amortizationSchema.parse(req.body))),
);

export const update = asyncHandler(async (req, res) =>
  res.json(await service.update(req.tenantId, Number(req.params.id), updateAmortizationSchema.parse(req.body))),
);

export const remove = asyncHandler(async (req, res) =>
  res.json(await service.remove(req.tenantId, Number(req.params.id))),
);

// Gemini Vision scan → returns an editable draft, nothing saved.
export const scan = asyncHandler(async (req, res) => {
  const draft = await scanAmortization(req.tenantId, req.file);
  res.json(draft);
});

// Read a monthly payment schedule from an upload (CSV/XLSX parsed directly;
// photo/PDF via Gemini). Returns the rows for review — nothing saved yet.
export const scanSchedule = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Upload a payment schedule (CSV, Excel, PDF or photo)');
  const viaAI = isImageOrPdf(req.file);
  const schedule = viaAI
    ? await scanPaymentSchedule(req.tenantId, req.file)
    : await parseSchedule(req.file);
  if (!schedule.length) {
    throw new ApiError(400, viaAI
      ? 'Gemini could not read any payments from that file — try a clearer scan'
      : 'Could not read any payments (expected a date/month column and an amount column)');
  }
  res.json({ schedule, count: schedule.length, source: viaAI ? 'ai' : 'file' });
});

// Create the plan + one tracked installment per schedule row.
export const fromSchedule = asyncHandler(async (req, res) =>
  res.status(201).json(await service.createFromSchedule(req.tenantId, scheduleAmortizationSchema.parse(req.body))),
);
