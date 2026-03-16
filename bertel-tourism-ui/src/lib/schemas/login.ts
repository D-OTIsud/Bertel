import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Email invalide').optional(),
  password: z.string().min(8, 'Au moins 8 caracteres').optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
