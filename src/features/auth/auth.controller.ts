import { Request, Response, NextFunction } from 'express';
import { loginWithCredentials, loginWithGoogle, logout, registerWithCredentials, getProfile } from './auth.service';
import { AppError } from '../../core/errors';

export async function loginController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await loginWithCredentials(req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function googleLoginController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await loginWithGoogle(req.body.idToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function logoutController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'No autenticado');
    await logout(req.user.sub, req.user.jti);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function registerController(req: Request, res: Response, next: NextFunction) {
  try {
    const result = await registerWithCredentials(req.body.name, req.body.email, req.body.password);
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function meController(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError(401, 'No autenticado');
    const profile = await getProfile(req.user.sub);
    res.json(profile);
  } catch (err) {
    next(err);
  }
}
