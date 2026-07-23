import { Router } from 'express';
import { asyncHandler } from '../../shared/http.js';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as service from './service.js';

const router = Router();

// Audit trail — managers and up.
router.get(
  '/',
  requireMinRole('manager'),
  asyncHandler(async (req, res) => {
    res.json(await service.list(req.tenantId, {
      limit: req.query.limit,
      entityType: req.query.entity_type,
      entityId: req.query.entity_id ? Number(req.query.entity_id) : undefined,
      action: req.query.action,
    }));
  }),
);

export default router;
