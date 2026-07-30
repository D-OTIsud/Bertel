export const TOURINSOFT_VARIANTS = ['legacy-v1', 'reunion-hebergement-v1'] as const;
export type TourinsoftVariant = (typeof TOURINSOFT_VARIANTS)[number];

const VARIANTS = new Set<string>(TOURINSOFT_VARIANTS);

export type TourinsoftVariantResolution =
  | { ok: true; variant: TourinsoftVariant | null }
  | { ok: false; detail: string };

/**
 * `variant` is meaningful only for `format=tourinsoft`.
 * An absent variant preserves the historical Tourinsoft RPC path byte-for-byte.
 */
export function resolveTourinsoftVariant(format: string, rawVariant: string | null): TourinsoftVariantResolution {
  const supplied = rawVariant !== null && rawVariant.trim() !== '';
  if (!supplied) return { ok: true, variant: format === 'tourinsoft' ? 'legacy-v1' : null };
  if (format !== 'tourinsoft') {
    return { ok: false, detail: 'variant is only valid with format=tourinsoft' };
  }
  const variant = rawVariant!.trim().toLowerCase();
  if (!VARIANTS.has(variant)) {
    return { ok: false, detail: `unknown Tourinsoft variant: ${variant}` };
  }
  return { ok: true, variant: variant as TourinsoftVariant };
}
