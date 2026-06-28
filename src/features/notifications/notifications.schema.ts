import { z } from 'zod';

export const registerDeviceSchema = z.object({
  token: z.string().min(1),
  platform: z.enum(['android', 'ios', 'web']),
});

export const updatePrefsSchema = z.object({
  dailyReminder: z.boolean().optional(),
  budgetAlerts: z.boolean().optional(),
  recurringAlerts: z.boolean().optional(),
  reminderHour: z.string().regex(/^\d{2}:\d{2}$/).optional(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
export type UpdatePrefsInput = z.infer<typeof updatePrefsSchema>;
