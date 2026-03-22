import { z } from 'zod';

export const loginEmailSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Au moins 8 caracteres'),
});

export type LoginFormValues = z.infer<typeof loginEmailSchema>;
