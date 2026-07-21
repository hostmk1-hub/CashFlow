import { z } from 'zod';
// Settings accepts a simple key/value pair (secrets are encrypted in the service layer).
export const settingSchema = z.object({ key: z.string().min(1), value: z.string() });
