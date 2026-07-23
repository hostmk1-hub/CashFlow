import { createClientInvoiceSchema, updateClientInvoiceSchema, clientInvoiceStatusSchema } from './validation.js';
import { asyncHandler } from '../../shared/http.js';
import { logFromReq } from '../audit/service.js';
import * as service from './service.js';

export const list = asyncHandler(async (req, res) =>
  res.json(await service.list(req.tenantId, {
    company_id: req.query.company_id ? Number(req.query.company_id) : undefined,
    status: req.query.status,
    date_from: req.query.date_from,
    date_to: req.query.date_to,
    search: req.query.search,
  })),
);
export const getById = asyncHandler(async (req, res) =>
  res.json(await service.getById(req.tenantId, Number(req.params.id))),
);
export const create = asyncHandler(async (req, res) => {
  const inv = await service.create(req.tenantId, createClientInvoiceSchema.parse(req.body));
  await logFromReq(req, {
    action: 'client_invoice.create', entityType: 'client_invoice', entityId: inv.id,
    summary: `Created invoice ${inv.invoice_number} — ${inv.amount}`,
  });
  res.status(201).json(inv);
});
export const update = asyncHandler(async (req, res) => {
  const inv = await service.update(req.tenantId, Number(req.params.id), updateClientInvoiceSchema.parse(req.body));
  await logFromReq(req, {
    action: 'client_invoice.update', entityType: 'client_invoice', entityId: inv.id,
    summary: `Edited invoice ${inv.invoice_number}`,
  });
  res.json(inv);
});
export const setStatus = asyncHandler(async (req, res) => {
  const { status } = clientInvoiceStatusSchema.parse(req.body);
  const inv = await service.setStatus(req.tenantId, Number(req.params.id), status);
  await logFromReq(req, {
    action: 'client_invoice.status', entityType: 'client_invoice', entityId: Number(req.params.id),
    summary: `Invoice ${inv.invoice_number} marked ${status}`,
  });
  res.json(inv);
});
export const duplicate = asyncHandler(async (req, res) => {
  const inv = await service.duplicate(req.tenantId, Number(req.params.id));
  res.status(201).json(inv);
});
export const remove = asyncHandler(async (req, res) => {
  const result = await service.remove(req.tenantId, Number(req.params.id));
  await logFromReq(req, {
    action: 'client_invoice.delete', entityType: 'client_invoice', entityId: Number(req.params.id),
    summary: `Deleted invoice #${req.params.id}`,
  });
  res.json(result);
});
export const send = asyncHandler(async (req, res) =>
  res.json(await service.send(req.tenantId, Number(req.params.id))),
);
export const pdf = asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.pdf(req.tenantId, Number(req.params.id));
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
  res.send(buffer);
});
