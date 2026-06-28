import { Router } from 'express';
import { authMiddleware } from '../../core/middlewares/auth';
import { validate } from '../../core/middlewares/validate';
import { registerDeviceSchema, updatePrefsSchema } from './notifications.schema';
import {
  registerDeviceController,
  deleteDeviceController,
  getPrefsController,
  updatePrefsController,
} from './notifications.controller';

const router = Router();
router.use(authMiddleware);

router.post('/me/devices', validate(registerDeviceSchema), registerDeviceController);
router.delete('/me/devices/:token', deleteDeviceController);
router.get('/me/notification-prefs', getPrefsController);
router.put('/me/notification-prefs', validate(updatePrefsSchema), updatePrefsController);

export default router;
