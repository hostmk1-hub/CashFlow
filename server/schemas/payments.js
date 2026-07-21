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
    // Optional manual override: explicit list of invoiceIds to close (FIFO otherwise).
    invoiceIds: z.array(z.coerce.number().int().positive()).optional(),
  }),
);
