import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.get('/:id/pdf', ctrl.pdf);
router.post('/', requireMinRole('staff'), ctrl.create);
router.put('/:id', requireMinRole('staff'), ctrl.update);
router.patch('/:id/status', requireMinRole('staff'), ctrl.setStatus);
router.post('/:id/duplicate', requireMinRole('staff'), ctrl.duplicate);
router.delete('/:id', requireMinRole('manager'), ctrl.remove);
router.post('/:id/send', requireMinRole('manager'), ctrl.send);

export default router;
