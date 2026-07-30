import { resolveTourinsoftVariant, TOURINSOFT_VARIANTS } from './tourinsoft-export';

describe('resolveTourinsoftVariant', () => {
  it('keeps Tourinsoft legacy-v1 as the default', () => {
    expect(resolveTourinsoftVariant('tourinsoft', null)).toEqual({ ok: true, variant: 'legacy-v1' });
    expect(TOURINSOFT_VARIANTS).toEqual(['legacy-v1', 'reunion-hebergement-v1']);
  });

  it('accepts the regional opt-in variant case-insensitively', () => {
    expect(resolveTourinsoftVariant('tourinsoft', ' Reunion-Hebergement-V1 ')).toEqual({
      ok: true,
      variant: 'reunion-hebergement-v1',
    });
  });

  it('rejects variants on another format and unknown Tourinsoft variants', () => {
    expect(resolveTourinsoftVariant('apidae', 'legacy-v1').ok).toBe(false);
    expect(resolveTourinsoftVariant('tourinsoft', 'v99').ok).toBe(false);
  });
});
