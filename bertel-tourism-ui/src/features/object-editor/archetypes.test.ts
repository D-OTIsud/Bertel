import { getArchetypeMeta, TYPE_ARCHETYPES, TYPE_LABEL } from './archetypes';

// = object_type enum (schema_unified.sql:174 + ALTER :1259) minus ORG (deliberately unmapped:
// the editor renders an explicit unsupported-type panel for ORG — managed via /team).
// Verified against live pg_enum 2026-06-10: 17 values incl. ACT + ORG.
const DB_OBJECT_TYPES_MINUS_ORG = [
  'RES', 'PCU', 'PNA', 'ITI', 'VIL', 'HPA', 'ASC', 'COM', 'HOT', 'HLO', 'LOI', 'FMA', 'CAMP', 'PSV', 'RVA', 'ACT',
];

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

  it('maps exactly the DB enum minus ORG — no phantom keys, no missing types', () => {
    expect(Object.keys(TYPE_ARCHETYPES).sort()).toEqual([...DB_OBJECT_TYPES_MINUS_ORG].sort());
  });

  it('routes ACT to the ASC archetype (object_act is the shared activity facet — §48)', () => {
    expect(getArchetypeMeta('ACT')?.archetype).toBe('ASC');
    expect(getArchetypeMeta('ACT')?.covers).toContain('ACT');
  });

  it('returns null for ORG and unknown codes (no silent HEB fallback)', () => {
    expect(getArchetypeMeta('ORG')).toBeNull();
    expect(getArchetypeMeta('XXX')).toBeNull();
    expect(getArchetypeMeta('')).toBeNull();
  });

  it('labels ACT and ORG in the topbar vocabulary', () => {
    expect(TYPE_LABEL.ACT).toBeTruthy();
    expect(TYPE_LABEL.ORG).toBeTruthy();
    expect(TYPE_LABEL.SRV).toBeUndefined(); // SRV is an archetype name, not a DB type
  });
});
