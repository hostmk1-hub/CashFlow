import { z } from 'zod';
import { currencyEnum, methodEnum } from './index.js';

export const createClientInvoiceSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  vehicle_id: z.coerce.number().int().positive().nullish(),
  description: z.string().min(1).max(300),
  amount: z.coerce.number().positive(),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
  issue_date: z.string().min(1),
  due_date: z.string().min(1),
  send: z.boolean().optional(), // save & send vs save as draft
});

export const updateClientInvoiceSchema = createClientInvoiceSchema.partial();

export const clientPaymentPreviewSchema = z.object({
  companyId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive(),
  currency: currencyEnum,
  exchangeRate: z.coerce.number().positive().optional(),
});

export const createClientPaymentSchema = clientPaymentPreviewSchema.and(
  z.object({
    method: methodEnum,
    note: z.string().nullish(),
    paidAt: z.coerce.date().optional(),
  }),
);
