import {
  buildCreateTypeOptions,
  buildCreateTypeTaxonomyLabels,
  validateCreateObjectInput,
  MAX_OBJECT_NAME_LENGTH,
} from './create-object-options';
import { TYPE_ARCHETYPES } from '../archetypes';
import type { ExplorerTaxonomyDomain } from '../../../types/domain';

describe('buildCreateTypeOptions', () => {
  it('covers exactly the creatable types (enum minus ORG) with no duplicates', () => {
    const groups = buildCreateTypeOptions();
    const codes = groups.flatMap((g) => g.types.map((t) => t.code)).sort();
    expect(codes).toEqual(Object.keys(TYPE_ARCHETYPES).sort());
    expect(codes).not.toContain('ORG');
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('groups by the 7 archetypes', () => {
    expect(buildCreateTypeOptions().map((g) => g.archetype).sort())
      .toEqual(['ASC', 'FMA', 'HEB', 'ITI', 'RES', 'SRV', 'VIS']);
  });

  it('labels every type and carries archetype meta', () => {
    const heb = buildCreateTypeOptions().find((g) => g.archetype === 'HEB');
    expect(heb?.codeName).toBeTruthy();
    expect(heb?.family).toBeTruthy();
    expect(heb?.types.find((t) => t.code === 'HOT')?.label).toBe('Hôtel');
  });

  it('uses the canonical labels shared with filters and the rest of the application', () => {
    const heb = buildCreateTypeOptions().find((g) => g.archetype === 'HEB');
    expect(heb?.types.find((t) => t.code === 'CAMP')?.label).toBe('Camping classé');
    expect(heb?.types.find((t) => t.code === 'HPA')?.label).toBe('Hébergement de plein air');
    expect(heb?.types.find((t) => t.code === 'RVA')?.label).toBe('Résidence de vacances');
  });
});

describe('buildCreateTypeTaxonomyLabels', () => {
  it('uses assignable nodes from the Explorer taxonomy and prefixes descendants with their path', () => {
    const taxonomies: ExplorerTaxonomyDomain[] = [{
      domain: 'taxonomy_hlo',
      name: 'Hébergement locatif',
      objectType: 'HLO',
      nodes: [
        { code: 'chambre_d_hotes', name: 'Chambre d’hôtes', parentCode: null, depth: 0, isAssignable: true, position: 1 },
        { code: 'cdh_maison', name: 'Maison d’hôtes', parentCode: 'chambre_d_hotes', depth: 1, isAssignable: true, position: 2 },
        { code: 'legacy', name: 'Ancien code', parentCode: null, depth: 0, isAssignable: false, position: 3 },
      ],
    }];

    expect(buildCreateTypeTaxonomyLabels(taxonomies, 'HLO')).toEqual([
      'Chambre d’hôtes',
      'Chambre d’hôtes › Maison d’hôtes',
    ]);
    expect(buildCreateTypeTaxonomyLabels(taxonomies, 'HOT')).toEqual([]);
  });
});

describe('validateCreateObjectInput', () => {
  it('rejects an empty / whitespace name', () => {
    const r = validateCreateObjectInput({ type: 'HOT', name: '  ' });
    expect(r.ok).toBe(false);
    expect(r.errors.name).toBeTruthy();
  });

  it('rejects an unknown type', () => {
    expect(validateCreateObjectInput({ type: 'ZZZ', name: 'X' }).errors.type).toBeTruthy();
    expect(validateCreateObjectInput({ type: 'ORG', name: 'X' }).errors.type).toBeTruthy();
  });

  it('rejects an over-long name', () => {
    const long = 'x'.repeat(MAX_OBJECT_NAME_LENGTH + 1);
    expect(validateCreateObjectInput({ type: 'HOT', name: long }).errors.name).toBeTruthy();
  });

  it('accepts a valid type + name pair', () => {
    expect(validateCreateObjectInput({ type: 'HOT', name: 'Hôtel des Cimes' })).toEqual({ ok: true, errors: {} });
  });
});
