import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { loginSchema } from './auth.schema';
import { loginController, logoutController } from './auth.controller';
import { authRateLimiter } from './auth.ratelimit';

const router = Router();

router.post('/login', authRateLimiter, validate(loginSchema), loginController);
router.post('/logout', authMiddleware, logoutController);

export default router;
