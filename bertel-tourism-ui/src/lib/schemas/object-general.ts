import { z } from 'zod';

export const objectGeneralSchema = z.object({
  name: z.string().min(1, 'Nom requis'),
  description: z.string().optional(),
  address: z.string().optional(),
});

export type ObjectGeneralFormValues = z.infer<typeof objectGeneralSchema>;
