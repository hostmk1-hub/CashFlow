import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.post('/', requireMinRole('manager'), ctrl.create);
router.post('/scan', requireMinRole('staff'), ctrl.upload.single('file'), ctrl.scan);
router.post('/confirm', requireMinRole('manager'), ctrl.confirm);
router.delete('/:id', requireMinRole('manager'), ctrl.remove);

export default router;
