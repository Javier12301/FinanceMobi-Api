import { Router } from 'express';
import { validate } from '../../core/middlewares/validate';
import { authMiddleware } from '../../core/middlewares/auth';
import { loginSchema, googleLoginSchema, registerSchema } from './auth.schema';
import { loginController, googleLoginController, logoutController, registerController } from './auth.controller';
import { authRateLimiter } from './auth.ratelimit';

const router = Router();

router.post('/register', authRateLimiter, validate(registerSchema), registerController);
router.post('/login', authRateLimiter, validate(loginSchema), loginController);
router.post('/google', authRateLimiter, validate(googleLoginSchema), googleLoginController);
router.post('/logout', authMiddleware, logoutController);

export default router;
