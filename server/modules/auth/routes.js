import { Router } from 'express';
import { requireAuth } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.post('/signup', ctrl.signup);
router.post('/login', ctrl.login);
router.get('/me/tenants', requireAuth, ctrl.myTenants);
router.post('/tenants/:id/switch', requireAuth, ctrl.switchTenant);

export default router;
