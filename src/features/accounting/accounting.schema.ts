import { z } from 'zod';

export const resetAccountingSchema = z.object({
  walletStrategy: z.enum(['KEEP', 'DELETE']),
  requestId: z.string().uuid().optional(),
});

export type ResetAccountingInput = z.infer<typeof resetAccountingSchema>;
