import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireMinRole('staff'), ctrl.create);
router.post('/:id/pay', requireMinRole('manager'), ctrl.payInvoice);

export default router;
