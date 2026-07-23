import { Router } from 'express';
import { requireMinRole } from '../../shared/middleware/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/preview', requireMinRole('manager'), ctrl.preview);
router.post('/', requireMinRole('manager'), ctrl.create);
router.patch('/:id', requireMinRole('manager'), ctrl.update);
router.delete('/:id', requireMinRole('manager'), ctrl.remove);
router.get('/:id/proof', ctrl.downloadProof);
router.post('/:id/proof', requireMinRole('manager'), ctrl.upload.single('file'), ctrl.uploadProof);

export default router;
