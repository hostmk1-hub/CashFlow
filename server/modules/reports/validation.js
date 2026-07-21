import { z } from 'zod';
// Reports are read-only; this validates the common query params.
export const reportQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  month: z.string().optional(),
  q: z.string().optional(),
});
