import {
  isRegionalTourinsoftVariant,
  resolveTourinsoftVariant,
  TOURINSOFT_VARIANTS,
} from './tourinsoft-export';

describe('resolveTourinsoftVariant', () => {
  it('keeps Tourinsoft legacy-v1 as the default', () => {
    expect(resolveTourinsoftVariant('tourinsoft', null)).toEqual({ ok: true, variant: 'legacy-v1' });
    expect(TOURINSOFT_VARIANTS).toEqual([
      'legacy-v1',
      'reunion-hebergement-v1',
      'reunion-regional-v1',
    ]);
  });

  it.each(['reunion-hebergement-v1', 'reunion-regional-v1'] as const)(
    'accepts the regional opt-in variant %s case-insensitively',
    (variant) => {
      expect(resolveTourinsoftVariant('tourinsoft', ` ${variant.toUpperCase()} `)).toEqual({
        ok: true,
        variant,
      });
      expect(isRegionalTourinsoftVariant(variant)).toBe(true);
    },
  );

  it('does not classify the legacy/default variant as regional', () => {
    expect(isRegionalTourinsoftVariant('legacy-v1')).toBe(false);
    expect(isRegionalTourinsoftVariant(null)).toBe(false);
  });

  it('rejects variants on another format and unknown Tourinsoft variants', () => {
    expect(resolveTourinsoftVariant('apidae', 'legacy-v1').ok).toBe(false);
    expect(resolveTourinsoftVariant('tourinsoft', 'v99').ok).toBe(false);
  });
});
