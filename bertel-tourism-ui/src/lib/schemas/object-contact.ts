import { z } from 'zod';

export const objectContactSchema = z.object({
  label: z.string().min(1, 'Libelle requis').optional(),
  value: z.string().min(1, 'Valeur requise'),
  kind: z.string().optional(),
});

export type ObjectContactFormValues = z.infer<typeof objectContactSchema>;
