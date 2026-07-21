import { ZodError } from 'zod';

/**
 * Wraps an async route handler so thrown errors flow to the error middleware
 * instead of crashing the process.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

/** Domain error carrying an HTTP status code. */
export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Central error handler — registered last in server.js. */
export function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Validation failed', details: err.flatten() });
  }
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  // Postgres unique-violation → 409
  if (err?.code === '23505') {
    return res.status(409).json({ error: 'Duplicate value', details: err.detail });
  }
  console.error('[error]', err);
  return res.status(500).json({ error: 'Internal server error' });
}
