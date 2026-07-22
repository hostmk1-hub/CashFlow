import { z } from 'zod';
import { currencyEnum } from './index.js';

export const scannedInvoiceDraftSchema = z.object({
  invoice_number: z.string().nullish(),
  description: z.string().nullish(),
  amount: z.coerce.number().nullish(),
  currency: currencyEnum,
  date: z.string().nullish(),
  vendor_name: z.string().nullish(),
  matched_company_id: z.coerce.number().int().positive().nullish(),
  matched_vehicle_id: z.coerce.number().int().positive().nullish(),
  detected_plate: z.string().nullish(),
  exchange_rate: z.coerce.number().positive().optional(),
  scan_url: z.string().nullish(),
  // Optional: pay this scanned invoice over N monthly installments, and tag it.
  installments: z.coerce.number().int().positive().max(360).optional(),
  category: z.string().nullish(),
});
