import { z } from 'zod';

export const createVehicleSchema = z.object({
  plate: z.string().min(1).max(20),
  make: z.string().min(1).max(100),
  model: z.string().min(1).max(100),
  year: z.coerce.number().int().min(1950).max(2100),
  rentalsyst_id: z.string().max(100).nullish(),
});

export const updateVehicleSchema = createVehicleSchema.partial();
