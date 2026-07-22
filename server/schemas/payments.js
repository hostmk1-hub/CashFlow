import { z } from 'zod';
import { currencyEnum, methodEnum } from './index.js';

// Preview: no method needed, we just want the FIFO plan for an amount.
export const paymentPreviewSchema = z
  .object({
    companyId: z.coerce.number().int().positive().nullish(),
    workerId: z.coerce.number().int().positive().nullish(),
    amount: z.coerce.number().positive(),
    currency: currencyEnum,
    exchangeRate: z.coerce.number().positive().optional(),
  })
  .refine((v) => v.companyId || v.workerId, {
    message: 'Either companyId or workerId is required',
  });

export const createPaymentSchema = paymentPreviewSchema.and(
  z.object({
    method: methodEnum,
    note: z.string().nullish(),
    // Payment date (defaults to today when omitted).
    paidAt: z.coerce.date().optional(),
    // Optional manual override: explicit list of invoiceIds to close (FIFO otherwise).
    invoiceIds: z.array(z.coerce.number().int().positive()).optional(),
  }),
);

// Editing an existing payment: any subset of amount / method / date / note.
// Changing the amount re-allocates across the same invoices the payment covered.
export const updatePaymentSchema = z
  .object({
    amount: z.coerce.number().positive().optional(),
    method: methodEnum.optional(),
    paidAt: z.coerce.date().optional(),
    note: z.string().nullish(),
  })
  .refine((v) => v.amount != null || v.method != null || v.paidAt != null || v.note !== undefined, {
    message: 'Nothing to update',
  });
