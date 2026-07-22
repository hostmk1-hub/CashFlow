import multer from 'multer';
import { createCompanySchema, updateCompanySchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import * as service from './service.js';
import { parseInvoiceList, reconcile } from './reconcile.js';
import { scanInvoiceListDocument } from '../../services/geminiService.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

const IMAGE_OR_PDF = /\.(png|jpe?g|webp|gif|heic|heif|bmp|tiff?|pdf)$/i;
function isImageOrPdf(file) {
  const mt = (file.mimetype || '').toLowerCase();
  if (mt.startsWith('image/') || mt === 'application/pdf') return true;
  return IMAGE_OR_PDF.test(file.originalname || '');
}

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

export const reconcileUpload = asyncHandler(async (req, res) => {
  if (!req.file) throw new ApiError(400, 'Upload a CSV, XLSX, PDF or photo of the invoice list');
  const viaAI = isImageOrPdf(req.file);
  const uploaded = viaAI
    ? await scanInvoiceListDocument(req.tenantId, req.file)   // photo/PDF → Gemini reads the list
    : await parseInvoiceList(req.file);                       // CSV/XLSX → parse directly
  if (!uploaded.length) {
    throw new ApiError(
      400,
      viaAI
        ? 'Gemini could not read any invoices from that photo/PDF — try a clearer scan'
        : 'Could not read any invoices from the file (expected an invoice-number column)',
    );
  }
  const result = await reconcile(req.tenantId, Number(req.params.id), uploaded);
  res.json({ ...result, source: viaAI ? 'ai' : 'file' });
});
