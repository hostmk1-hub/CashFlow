import { z } from 'zod';
import { currencyEnum } from './index.js';

export const EXPENSE_CATEGORIES = ['leasing', 'insurance', 'repairs', 'service', 'tires', 'other'];
export const expenseCategoryEnum = z.enum(EXPENSE_CATEGORIES).nullish();

export const createInvoiceSchema = z
  .object({
    company_id: z.coerce.number().int().positive().nullish(),
    worker_id: z.coerce.number().int().positive().nullish(),
    vehicle_id: z.coerce.number().int().positive().nullish(),
    amort_plan_id: z.coerce.number().int().positive().nullish(),
    invoice_number: z.string().max(100).nullish(),
    description: z.string().min(1).max(300),
    amount: z.coerce.number().positive(),
    due_date: z.string().min(1), // ISO date
    currency: currencyEnum,
    exchange_rate: z.coerce.number().positive().optional(),
    source: z.enum(['manual', 'recurring', 'amortization', 'salary', 'scanned']).default('manual'),
    category: expenseCategoryEnum,
    // Split the amount into N monthly installments (1 = a single invoice).
    installments: z.coerce.number().int().min(1).max(360).default(1),
  })
  .refine((v) => v.company_id || v.worker_id, {
    message: 'Either company_id or worker_id is required',
  });

export const invoiceFiltersSchema = z.object({
  company_id: z.coerce.number().int().positive().optional(),
  worker_id: z.coerce.number().int().positive().optional(),
  vehicle_id: z.coerce.number().int().positive().optional(),
  status: z.enum(['open', 'partial', 'paid']).optional(),
  source: z.enum(['manual', 'recurring', 'amortization', 'salary', 'scanned']).optional(),
  category: z.enum(['leasing', 'insurance', 'repairs', 'service', 'tires', 'other']).optional(),
  currency: z.enum(['MKD', 'EUR']).optional(),
  date_from: z.string().optional(),
  date_to: z.string().optional(),
});
