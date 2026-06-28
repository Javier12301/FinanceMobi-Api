import { NextFunction, Request, Response } from 'express';
import { getActivityStats } from './stats.service';

export async function statsController(req: Request, res: Response, next: NextFunction) {
  try {
    const stats = await getActivityStats(req.user!.sub);
    res.json(stats);
  } catch (err) {
    next(err);
  }
}
