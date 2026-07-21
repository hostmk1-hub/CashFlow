import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/amortization', ctrl.amortization);
router.get('/:id/pnl', ctrl.pnl);
router.post('/:id/income', requireMinRole('staff'), ctrl.setIncome);
router.post('/', requireMinRole('staff'), ctrl.create);
router.put('/:id', requireMinRole('manager'), ctrl.update);
router.delete('/:id', requireMinRole('manager'), ctrl.remove);

export default router;
