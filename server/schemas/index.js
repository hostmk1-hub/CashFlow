import { z } from 'zod';

export const currencyEnum = z.enum(['MKD', 'EUR']).default('MKD');
export const methodEnum = z.enum(['cash', 'card', 'bank']);
export const roleEnum = z.enum(['owner', 'admin', 'manager', 'staff']);
export const companyTypeEnum = z.enum(['vendor', 'client', 'both']);
export const categoryEnum = z.enum(['leasing', 'service', 'tires', 'other']).nullable().optional();

// coerce numeric strings from JSON bodies into numbers
export const money = z.coerce.number().positive();
export const moneyNonNeg = z.coerce.number().min(0);
