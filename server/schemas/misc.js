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
  // Schedule fields optional — a lease can be saved with just its identity
  // (company + contract number + car price) and the schedule filled in later.
  total_amount: z.coerce.number().positive().nullish(),
  purchase_price: z.coerce.number().min(0).nullish(), // car's real cash price
  lease_number: z.string().max(100).nullish(),        // leasing contract number
  down_payment: z.coerce.number().min(0).default(0),
  monthly_amount: z.coerce.number().positive().nullish(),
  months_total: z.coerce.number().int().positive().nullish(),
  interest_rate: z.coerce.number().min(0).nullish(),
  start_date: z.string().min(1).nullish(),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
  scan_url: z.string().nullish(),
  generate_invoices: z.boolean().default(true),
  // Whether the down payment was prepaid (records it as a settled expense).
  down_payment_paid: z.boolean().default(true),
});

// Build a lease plan straight from an uploaded monthly payment schedule — each
// month's exact amount becomes one tracked payment (no total/monthly formula).
export const scheduleAmortizationSchema = z.object({
  vehicle_id: z.coerce.number().int().positive(),
  company_id: z.coerce.number().int().positive(),
  lease_number: z.string().max(100).nullish(),
  purchase_price: z.coerce.number().min(0).nullish(),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
  start_date: z.string().min(1).nullish(), // fallback for rows with no date
  schedule: z.array(z.object({
    due_date: z.string().nullish(),
    amount: z.coerce.number().positive(),
  })).min(1).max(120),
});

// Editing an existing lease plan: the vehicle it belongs to doesn't change, and
// the down payment / invoice generation aren't re-run.
export const updateAmortizationSchema = z.object({
  company_id: z.coerce.number().int().positive(),
  total_amount: z.coerce.number().positive().nullish(),
  purchase_price: z.coerce.number().min(0).nullish(),
  lease_number: z.string().max(100).nullish(),
  monthly_amount: z.coerce.number().positive().nullish(),
  months_total: z.coerce.number().int().positive().nullish(),
  interest_rate: z.coerce.number().min(0).nullish(),
  start_date: z.string().min(1).nullish(),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
});
