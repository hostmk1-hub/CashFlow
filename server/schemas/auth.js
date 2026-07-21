import { z } from 'zod';
import { roleEnum } from './index.js';

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(1).optional(),
  companyName: z.string().min(1), // creates the first tenant
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const inviteSchema = z.object({
  email: z.string().email(),
  role: roleEnum.default('staff'),
});

export const acceptInviteSchema = z.object({
  name: z.string().min(1).optional(),
  password: z.string().min(6).optional(), // only needed if the user is new
});
