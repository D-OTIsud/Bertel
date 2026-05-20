import { getArchetypeMeta, TYPE_ARCHETYPES } from './archetypes';

describe('getArchetypeMeta', () => {
  it('maps accommodation codes to the HEB archetype with the teal accent', () => {
    expect(getArchetypeMeta('HOT')?.archetype).toBe('HEB');
    expect(getArchetypeMeta('CAMP')?.accent).toBe('acc-teal');
  });

  it('maps every itinerary code to ITI', () => {
    expect(getArchetypeMeta('ITI')?.archetype).toBe('ITI');
    expect(getArchetypeMeta('FMA')?.archetype).toBe('ITI');
  });

  it('is case-insensitive', () => {
    expect(getArchetypeMeta('hot')?.archetype).toBe('HEB');
  });

  it('returns null for an unknown code', () => {
    expect(getArchetypeMeta('ZZZ')).toBeNull();
    expect(getArchetypeMeta('')).toBeNull();
  });

  it('covers all 16 known codes', () => {
    expect(Object.keys(TYPE_ARCHETYPES)).toHaveLength(16);
  });
});
