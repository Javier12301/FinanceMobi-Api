import { z } from 'zod';

export const createDelegationSchema = z.object({
  email: z.string().email(),
  role: z.enum(['SUPERVISOR', 'ASESOR']),
});
