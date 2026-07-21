import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

// Mounted under /api/invoices so the endpoints are /api/invoices/scan[/confirm].
const router = Router();

router.post('/scan', requireMinRole('staff'), ctrl.upload.single('file'), ctrl.scan);
router.post('/scan/confirm', requireMinRole('staff'), ctrl.confirm);

export default router;
