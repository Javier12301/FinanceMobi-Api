import { NextFunction, Request, Response } from 'express';
import { getActivityStats, recordCheckIn } from './stats.service';

export async function statsController(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getActivityStats(req.user!.sub);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}

/** POST /me/check-in — marca la entrada de hoy (idempotente) y devuelve los stats. */
export async function checkInController(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await recordCheckIn(req.user!.sub);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}
