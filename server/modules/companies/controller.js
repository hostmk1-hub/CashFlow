import multer from 'multer';
import { createCompanySchema, updateCompanySchema } from './validation.js';
import { asyncHandler, ApiError } from '../../shared/http.js';
import * as service from './service.js';
import { parseInvoiceList, reconcile } from './reconcile.js';

export const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

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
  if (!req.file) throw new ApiError(400, 'Upload a CSV or XLSX file of the invoice list');
  const uploaded = await parseInvoiceList(req.file);
  if (!uploaded.length) throw new ApiError(400, 'Could not read any invoices from the file (expected an invoice-number column)');
  res.json(await reconcile(req.tenantId, Number(req.params.id), uploaded));
});
