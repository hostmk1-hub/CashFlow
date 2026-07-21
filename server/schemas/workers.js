import { z } from 'zod';

export const createWorkerSchema = z.object({
  name: z.string().min(1).max(200),
  position: z.string().max(100).nullish(),
  net_salary: z.coerce.number().positive(),
  payday_day: z.coerce.number().int().min(1).max(28).default(5),
});

export const updateWorkerSchema = createWorkerSchema.partial();
