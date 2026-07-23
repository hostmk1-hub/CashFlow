import { z } from 'zod';
import { currencyEnum, methodEnum } from './index.js';

export const CLIENT_INVOICE_STATUSES = ['draft', 'sent', 'paid', 'partial', 'overdue', 'cancelled'];

const invoiceItemSchema = z.object({
  description: z.string().min(1).max(500),
  quantity: z.coerce.number().nonnegative().default(1),
  unit_price: z.coerce.number().default(0),
  vat_rate: z.coerce.number().min(0).max(100).default(0),
});

// Invoice Manager create: line items + VAT + optional editable number. Legacy
// single {description, amount} still accepted for older callers (recurring, etc).
export const createClientInvoiceSchema = z
  .object({
    company_id: z.coerce.number().int().positive(),
    vehicle_id: z.coerce.number().int().positive().nullish(),
    invoice_number: z.string().max(50).optional(),
    currency: currencyEnum,
    exchange_rate: z.coerce.number().positive().optional(),
    vat_enabled: z.coerce.boolean().optional(),
    vat_rate: z.coerce.number().min(0).max(100).optional(),
    items: z.array(invoiceItemSchema).optional(),
    description: z.string().min(1).max(300).optional(), // legacy single-line
    amount: z.coerce.number().positive().optional(),     // legacy single amount
    amount_in_words: z.string().max(500).optional(),
    notes: z.string().max(2000).nullish(),
    status: z.enum(CLIENT_INVOICE_STATUSES).optional(),
    issue_date: z.string().min(1),
    due_date: z.string().optional(),
    send: z.boolean().optional(),
  })
  .refine((d) => (d.items && d.items.length > 0) || (d.description && d.amount != null), {
    message: 'Provide at least one line item (or a description and amount).',
  });

export const updateClientInvoiceSchema = z.object({
  company_id: z.coerce.number().int().positive().optional(),
  vehicle_id: z.coerce.number().int().positive().nullish(),
  invoice_number: z.string().max(50).optional(),
  currency: currencyEnum.optional(),
  exchange_rate: z.coerce.number().positive().optional(),
  vat_enabled: z.coerce.boolean().optional(),
  vat_rate: z.coerce.number().min(0).max(100).optional(),
  items: z.array(invoiceItemSchema).optional(),
  description: z.string().min(1).max(300).optional(),
  amount: z.coerce.number().positive().optional(),
  amount_in_words: z.string().max(500).optional(),
  notes: z.string().max(2000).nullish(),
  status: z.enum(CLIENT_INVOICE_STATUSES).optional(),
  issue_date: z.string().min(1).optional(),
  due_date: z.string().optional(),
});

export const clientInvoiceStatusSchema = z.object({
  status: z.enum(CLIENT_INVOICE_STATUSES),
});

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
