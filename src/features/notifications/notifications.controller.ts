import { NextFunction, Request, Response } from 'express';
import { registerDevice, deleteDevice, getPrefs, updatePrefs } from './notifications.service';

export async function registerDeviceController(req: Request, res: Response, next: NextFunction) {
  try {
    const device = await registerDevice(req.user!.sub, req.body);
    res.status(201).json(device);
  } catch (err) { next(err); }
}

export async function deleteDeviceController(req: Request, res: Response, next: NextFunction) {
  try {
    // URL-decode el token del path param
    await deleteDevice(req.user!.sub, decodeURIComponent(req.params.token));
    res.status(204).send();
  } catch (err) { next(err); }
}

export async function getPrefsController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await getPrefs(req.user!.sub));
  } catch (err) { next(err); }
}

export async function updatePrefsController(req: Request, res: Response, next: NextFunction) {
  try {
    res.json(await updatePrefs(req.user!.sub, req.body));
  } catch (err) { next(err); }
}
