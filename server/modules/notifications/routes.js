import { Router } from 'express';
import { asyncHandler } from '../../shared/http.js';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as service from './service.js';

const router = Router();

// Platform-level alerts (backup health, etc.). Visible to any signed-in user;
// only admins can resolve them.
router.get('/', asyncHandler(async (_req, res) => res.json(await service.listOpen())));
router.post(
  '/:id/resolve',
  requireMinRole('admin'),
  asyncHandler(async (req, res) => res.json(await service.resolve(Number(req.params.id)))),
);

export default router;
