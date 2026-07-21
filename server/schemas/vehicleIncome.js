import { z } from 'zod';
import { currencyEnum } from './index.js';

export const vehicleIncomeInputSchema = z.object({
  month: z.string().min(1), // any date within the month; normalized server-side
  amount: z.coerce.number().min(0),
  days_rented: z.coerce.number().int().min(0).max(31).default(0),
  currency: currencyEnum,
  exchange_rate: z.coerce.number().positive().optional(),
});
