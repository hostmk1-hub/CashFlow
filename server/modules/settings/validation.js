import { z } from 'zod';
// Settings accepts a simple key/value pair (secrets are encrypted in the service layer).
// Trim the value — pasted API keys often carry a trailing newline/space, which
// would otherwise be stored and sent to Google verbatim (→ auth failures).
export const settingSchema = z.object({ key: z.string().min(1), value: z.string().transform((s) => s.trim()) });
