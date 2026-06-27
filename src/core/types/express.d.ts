import type { JwtPayload } from '../security/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      ownerContext?: {
        ownerId: string;
        role: 'OWNER' | 'SUPERVISOR' | 'ASESOR';
      };
    }
  }
}
