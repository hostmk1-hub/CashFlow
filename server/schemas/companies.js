import { z } from 'zod';
import { companyTypeEnum } from './index.js';

export const createCompanySchema = z.object({
  name: z.string().min(1),
  type: companyTypeEnum.default('vendor'),
  category: z.string().max(20).nullish(),
  phone: z.string().max(50).nullish(),
  note: z.string().nullish(),
});

export const updateCompanySchema = createCompanySchema.partial();
