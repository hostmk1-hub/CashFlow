import { z } from 'zod';
import { currencyEnum } from './index.js';

// Re-exported from their own spec-named files (Step 2b) for convenience.
export { vehicleIncomeInputSchema } from './vehicleIncome.js';
export { scannedInvoiceDraftSchema } from './scannedInvoice.js';

export const dailyIncomeSchema = z.object({
  income_date: z.string().min(1),
  cash_amount: z.coerce.number().min(0).default(0),
  card_amount: z.coerce.number().min(0).default(0),
  note: z.string().nullish(),
});

export const recurringSchema = z
  .object({
    company_id: z.coerce.number().int().positive().nullish(),
    worker_id: z.coerce.number().int().positive().nullish(),
    vehicle_id: z.coerce.number().int().positive().nullish(),
    description: z.string().min(1).max(300),
    amount: z.coerce.number().positive(),
    day_of_month: z.coerce.number().int().min(1).max(28),
    active: z.boolean().default(true),
  })
  .refine((v) => v.company_id || v.worker_id, {
    message: 'Either company_id or worker_id is required',
  });

export const amortizationSchema = z.object({
  vehicle_id: z.coerce.number().int().positive(),
  company_id: z.coerce.number().int().positive(),
  total_amount: z.coerce.number().positive(),
  purchase_price: z.coerce.number().min(0).nullish(), // car's real cash price
  down_payment: z.coerce.number().min(0).default(0),
  monthly_amount: z.coerce.number().positive(),
  months_total: z.coerce.number().int().positive(),
  interest_rate: z.coerce.number().min(0).nullish(),
  start_date: z.string().min(1),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
  scan_url: z.string().nullish(),
  generate_invoices: z.boolean().default(true),
  // Whether the down payment was prepaid (records it as a settled expense).
  down_payment_paid: z.boolean().default(true),
});
