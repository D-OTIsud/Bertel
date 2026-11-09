/** @jest-environment node */
jest.mock('server-only', () => ({}));

import { OBJECT_TYPE_CODES } from './object-types';
import {
  PARTNER_SELECTIONS,
  getPartnerSelection,
  selectionDefinitionHash,
} from './partner-selections';

type PartnerSelection = Parameters<typeof selectionDefinitionHash>[0];

function requiredSelection(id: string): PartnerSelection {
  const selection = getPartnerSelection(id);
  if (!selection) throw new Error(`Missing partner selection ${id}`);
  return selection;
}

describe('partner selection registry', () => {
  it('preserves the published ID range without duplicate identifiers', () => {
    const ids = PARTNER_SELECTIONS.map((selection) => selection.id);
    const expected = Array.from({ length: 15 }, (_, index) => String(1001 + index));

    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
    for (const selection of PARTNER_SELECTIONS) {
      expect(getPartnerSelection(selection.id)).toBe(selection);
      expect(selection.name.trim()).not.toBe('');
      expect(Number.isInteger(selection.revision)).toBe(true);
      expect(selection.revision).toBeGreaterThan(0);
    }
  });

  it.each(['', '9999', '1001x', '01001', '1001 ', '__proto__', 'constructor', 'toString'])(
    'does not resolve an unknown or inherited identifier (%j)',
    (id) => {
      expect(getPartnerSelection(id)).toBeUndefined();
    },
  );

  it('uses only supported object types and taxonomies belonging to each branch', () => {
    for (const selection of PARTNER_SELECTIONS) {
      expect(selection.buckets.length).toBeGreaterThan(0);
      for (const bucket of selection.buckets) {
        expect(bucket.types.length).toBeGreaterThan(0);
        for (const type of bucket.types) {
          expect(OBJECT_TYPE_CODES.has(type)).toBe(true);
        }
        const taxonomy = bucket.filters?.taxonomy_any;
        if (taxonomy === undefined) continue;
        expect(Array.isArray(taxonomy)).toBe(true);
        for (const node of taxonomy as Array<{ domain: string; code: string }>) {
          expect(node.domain).toMatch(/^taxonomy_[a-z]+$/);
          expect(bucket.types).toContain(node.domain.slice('taxonomy_'.length).toUpperCase());
          expect(node.code.trim()).not.toBe('');
        }
      }
    }
  });

  it('keeps every feed within the four CASUD communes', () => {
    for (const selection of PARTNER_SELECTIONS) {
      expect([...selection.communeInsee].sort()).toEqual(['97403', '97412', '97417', '97422']);
    }
  });

  it('unites producers and selected shops without applying shop taxonomy to producers', () => {
    const selection = requiredSelection('1006');
    expect(selection.buckets).toHaveLength(2);
    const producers = selection.buckets.find((bucket) => bucket.types.includes('PRD'));
    const shops = selection.buckets.find((bucket) => bucket.types.includes('COM'));

    expect(producers?.types).toEqual(['PRD']);
    expect(producers?.filters?.taxonomy_any).toBeUndefined();
    expect(shops?.types).toEqual(['COM']);
    expect(shops?.filters?.taxonomy_any).toEqual([
      { domain: 'taxonomy_com', code: 'local_crafts' },
      { domain: 'taxonomy_com', code: 'weekly_market' },
      { domain: 'taxonomy_com', code: 'covered_market' },
    ]);
  });

  it.each([
    {
      id: '1001',
      practices: ['randonnee_pedestre'],
      fallbackCodes: ['hiking', 'interpretive_trail', 'coastal_path'],
    },
    {
      id: '1002',
      practices: ['velo_route', 'velo_vtt', 'cyclotourisme'],
      fallbackCodes: ['mountain_biking'],
    },
  ])('selects all declared practices and guards the taxonomy fallback for $id', ({ id, practices, fallbackCodes }) => {
    const selection = requiredSelection(id);
    expect(selection.buckets).toHaveLength(2);
    const declared = selection.buckets.find((bucket) => !bucket.only_without_practices);
    const fallback = selection.buckets.find((bucket) => bucket.only_without_practices === true);

    expect(declared?.types).toEqual(['ITI']);
    expect(declared?.filters).toMatchObject({ itinerary: { practices_any: practices } });
    expect(fallback?.types).toEqual(['ITI']);
    expect(fallback?.only_without_practices).toBe(true);
    expect(fallback?.filters?.taxonomy_any).toEqual(
      fallbackCodes.map((code) => ({ domain: 'taxonomy_iti', code })),
    );
  });
});

describe('selectionDefinitionHash', () => {
  it('is stable after serializing and rebuilding the same definition', () => {
    const selection = requiredSelection('1002');
    const rebuilt = JSON.parse(JSON.stringify(selection)) as PartnerSelection;
    expect(selectionDefinitionHash(rebuilt)).toBe(selectionDefinitionHash(selection));
  });

  it('keeps the hash when persisted filter properties return in another order', () => {
    const selection = requiredSelection('1002');
    const city = ['Le Tampon'];
    const itinerary = { practices_any: ['velo_route'] };
    const first: PartnerSelection = {
      ...selection,
      buckets: [{ types: ['ITI'], filters: { city_any: city, itinerary } }],
    };
    const reordered: PartnerSelection = {
      ...selection,
      buckets: [{ types: ['ITI'], filters: { itinerary, city_any: city } }],
    };

    expect(selectionDefinitionHash(reordered)).toBe(selectionDefinitionHash(first));
  });

  it('changes when a branch filter changes even if the ID and revision stay the same', () => {
    const selection = requiredSelection('1002');
    const first = selection.buckets[0];
    const changed: PartnerSelection = {
      ...selection,
      buckets: [
        { ...first, filters: { ...first.filters, city_any: ['Saint-Joseph'] } },
        ...selection.buckets.slice(1),
      ],
    };

    expect(selectionDefinitionHash(changed)).not.toBe(selectionDefinitionHash(selection));
  });

  it('changes when the revision or geographic scope changes', () => {
    const selection = requiredSelection('1002');
    const original = selectionDefinitionHash(selection);
    expect(selectionDefinitionHash({ ...selection, revision: selection.revision + 1 })).not.toBe(original);
    expect(selectionDefinitionHash({ ...selection, communeInsee: ['97412'] })).not.toBe(original);
  });
});
