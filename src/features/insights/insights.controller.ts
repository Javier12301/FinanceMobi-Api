import { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { getInsights } from './insights.service';
import { AppError } from '../../core/errors';

const monthSchema = z.string().regex(/^\d{4}-\d{2}$/);

export async function insightsController(req: Request, res: Response, next: NextFunction) {
  try {
    const month = req.query.month as string | undefined ?? new Date().toISOString().slice(0, 7);
    if (!monthSchema.safeParse(month).success) throw new AppError(400, 'month debe tener formato YYYY-MM');
    res.json(await getInsights(req.ownerContext!, month));
  } catch (err) { next(err); }
}
