import multer from 'multer';
import { createCompanySchema, updateCompanySchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import * as service from './service.js';
import { parseInvoiceList, reconcile } from './reconcile.js';
import { scanInvoiceListDocument, reconciliationReport } from '../../services/geminiService.js';
import * as notifications from '../notifications/repository.js';

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
  const companyId = Number(req.params.id);
  const result = await reconcile(req.tenantId, companyId, uploaded);

  // AI narrative for EVERY reconciliation (spreadsheet or photo) — Gemini writes
  // the plain-language report of what's missing / incorrect / totals & paid
  // mismatches. Best-effort: if Gemini isn't configured or fails, we still return
  // the structured result so the check always works.
  const company = await service.getById(req.tenantId, companyId).catch(() => null);
  const companyName = company?.name || `#${companyId}`;
  let aiReport = null;
  try {
    aiReport = await reconciliationReport(req.tenantId, { companyName, result });
  } catch (e) {
    console.warn('[reconcile] AI report skipped:', e.message);
    aiReport = { report: '', ok: null, error: e.status === 400 ? 'no-key' : 'failed' };
  }

  // Notify the admin dashboard when there's anything to look at.
  const hasIssues =
    result.missingInSystem.length || result.mismatches.length ||
    !result.totals.match || !result.paid.match;
  if (hasIssues) {
    const parts = [];
    if (result.missingInSystem.length) parts.push(`${result.missingInSystem.length} missing in our system`);
    if (result.mismatches.length) parts.push(`${result.mismatches.length} amount/status diffs`);
    if (!result.totals.match) parts.push(`totals off by ${result.totals.difference}`);
    if (!result.paid.match) parts.push(`paid off by ${result.paid.difference}`);
    await notifications
      .create({
        level: 'warning',
        title: `Reconciliation issues — ${companyName}`,
        message: aiReport?.report || parts.join('; '),
        context: { tenantId: req.tenantId, companyId, source: viaAI ? 'ai' : 'file', summary: parts },
      })
      .catch((e) => console.warn('[reconcile] notify failed:', e.message));
  }

  res.json({ ...result, source: viaAI ? 'ai' : 'file', aiReport });
});
