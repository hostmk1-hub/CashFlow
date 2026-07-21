import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.get('/status', ctrl.status);
router.post('/', requireMinRole('manager'), ctrl.create);
router.put('/:id', requireMinRole('manager'), ctrl.update);
router.delete('/:id', requireMinRole('manager'), ctrl.remove);

export default router;
