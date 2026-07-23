import { createInvoiceSchema, invoiceFiltersSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import { logFromReq } from '../audit/service.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) => {
  const filters = invoiceFiltersSchema.parse(req.query);
  res.json(await service.list(req.tenantId, filters));
});
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, Number(req.params.id))),
);
export const create = asyncHandler(async (req, res) =>
  res.status(201).json(await service.create(req.tenantId, createInvoiceSchema.parse(req.body))),
);
export const update = asyncHandler(async (req, res) => {
  const data = createInvoiceSchema.parse(req.body);
  const result = await service.update(req.tenantId, Number(req.params.id), data);
  await logFromReq(req, { action: 'invoice.update', entityType: 'invoice', entityId: Number(req.params.id), summary: `Edited invoice #${req.params.id} — ${data.description}`, details: { amount: data.amount, currency: data.currency } });
  res.json(result);
});
export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.tenantId, Number(req.params.id));
  await logFromReq(req, { action: 'invoice.delete', entityType: 'invoice', entityId: Number(req.params.id), summary: `Deleted invoice #${req.params.id}` });
  res.json(result);
});
export const payInvoice = asyncHandler(async (req, res) => {
  const result = await service.payInvoice(req.tenantId, Number(req.params.id), {
    amount: req.body.amount, method: req.body.method, paidAt: req.body.paidAt,
  });
  await logFromReq(req, {
    action: 'invoice.pay', entityType: 'invoice', entityId: Number(req.params.id),
    summary: `Marked invoice #${req.params.id} paid (${result.payment ? result.payment.amount : req.body.amount || 'full'}, ${req.body.method || 'bank'})`,
    details: { amount: req.body.amount, method: req.body.method, paidAt: req.body.paidAt, paymentId: result.payment?.id },
  });
  res.status(201).json(result);
});

export const download = asyncHandler(async (req, res) => {
  const { buffer, filename, contentType } = await service.downloadInvoice(req.tenantId, Number(req.params.id));
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.end(buffer);
});
