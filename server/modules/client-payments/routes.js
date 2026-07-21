import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.post('/preview', requireMinRole('manager'), ctrl.preview);
router.post('/', requireMinRole('manager'), ctrl.create);

export default router;
