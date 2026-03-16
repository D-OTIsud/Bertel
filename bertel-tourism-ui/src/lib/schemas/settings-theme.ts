import { z } from 'zod';

export const settingsThemeSchema = z.object({
  brandName: z.string().min(1, 'Nom de marque requis'),
  logoUrl: z.string().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex (ex: #0c7d75)').optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex').optional(),
  textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex').optional(),
  backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex').optional(),
  surfaceColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Couleur hex').optional(),
});

export type SettingsThemeFormValues = z.infer<typeof settingsThemeSchema>;
