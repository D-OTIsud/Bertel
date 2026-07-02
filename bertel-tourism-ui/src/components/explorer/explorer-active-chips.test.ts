import { buildExplorerActiveChips } from './explorer-active-chips';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import type { ExplorerFilters } from '../../types/domain';

function filters(overrides: Partial<ExplorerFilters['common']> = {}, top: Partial<ExplorerFilters> = {}): ExplorerFilters {
  return {
    ...DEFAULT_EXPLORER_FILTERS,
    ...top,
    common: { ...DEFAULT_EXPLORER_FILTERS.common, ...overrides },
  };
}

describe('buildExplorerActiveChips', () => {
  it('ne renvoie aucune pastille pour les filtres par défaut', () => {
    expect(buildExplorerActiveChips(DEFAULT_EXPLORER_FILTERS)).toEqual([]);
  });

  it('rend le terme de recherche comme une pastille retirable', () => {
    const chips = buildExplorerActiveChips(filters({ search: 'tamarins' }));
    const search = chips.find((c) => c.group === 'search');
    expect(search).toBeTruthy();
    expect(search!.label).toMatch(/tamarins/);
    expect(search!.value).toBe('tamarins');
  });

  it('rend une pastille par bucket sélectionné avec libellé FR', () => {
    const chips = buildExplorerActiveChips(filters({}, { selectedBuckets: ['HOT', 'VIS'] }));
    const buckets = chips.filter((c) => c.group === 'bucket');
    expect(buckets.map((c) => c.value).sort()).toEqual(['HOT', 'VIS']);
    expect(buckets.every((c) => !/^(HOT|VIS)$/.test(c.label))).toBe(true); // libellé, pas code brut
  });

  it('rend une pastille par commune et par label/tag', () => {
    const chips = buildExplorerActiveChips(
      filters({
        cities: ['Saint-Paul', 'Salazie'],
        labelsAny: ['Clef Verte'],
        tagsAny: [{ slug: 'spa', name: 'Spa', color: '#176b6a' }],
      }),
    );
    expect(chips.filter((c) => c.group === 'city')).toHaveLength(2);
    expect(chips.find((c) => c.group === 'label')?.value).toBe('Clef Verte');
    expect(chips.find((c) => c.group === 'tag')?.value).toBe('spa');
  });

  it('rend les bascules booléennes actives (PMR, animaux, ouvert)', () => {
    const chips = buildExplorerActiveChips(filters({ pmr: true, petsAccepted: true, openNow: true }));
    expect(chips.map((c) => c.group)).toEqual(expect.arrayContaining(['pmr', 'pets', 'openNow']));
  });

  it('chaque pastille a une clé unique', () => {
    const chips = buildExplorerActiveChips(
      filters({ search: 'x', cities: ['A', 'B'], pmr: true }, { selectedBuckets: ['HOT'] }),
    );
    const keys = chips.map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  describe('D23 — complétude des pastilles (filtres jusqu’ici invisibles)', () => {
    it('zone dessinée, types de handicap (FR) et compteurs a11y/durable', () => {
      const chips = buildExplorerActiveChips(
        filters({
          polygon: { type: 'Polygon', coordinates: [[[55, -21], [55.1, -21], [55.1, -21.1], [55, -21]]] },
          accessibilityDisabilityTypesAny: ['motor', 'hearing'],
          accessibilityAmenityCodesAny: ['acc_ramp', 'acc_wc'],
          sustainabilityCategoryCodesAny: ['CAT_WATER'],
          sustainabilityActionCodesAny: ['SA_1', 'SA_2', 'SA_3'],
        }),
      );
      expect(chips.find((c) => c.group === 'zone')?.label).toMatch(/Zone dessinée/);
      expect(chips.filter((c) => c.group === 'accessDisability').map((c) => c.label)).toEqual([
        'Accessibilité · Moteur',
        'Accessibilité · Auditif',
      ]);
      expect(chips.find((c) => c.group === 'accessAmenities')?.label).toBe('Accessibilité · 2 critères');
      expect(chips.find((c) => c.group === 'sustCategories')?.label).toBe('Durable · 1 catégorie');
      expect(chips.find((c) => c.group === 'sustActions')?.label).toBe('Durable · 3 actions');
    });

    it('facettes par bucket : taxonomie/capacité HÉB, capacité RES, facettes ITI', () => {
      const chips = buildExplorerActiveChips(
        filters(
          {},
          {
            hot: {
              subtypes: ['HOT'],
              taxonomy: [{ domain: 'd', code: 'x' }],
              capacityFilters: [{ code: 'bedrooms', min: 2 }],
              meetingRoom: {},
            },
            res: { capacityFilters: [{ code: 'seats', max: 60 }] },
            iti: {
              isLoop: true,
              practicesAny: ['walk', 'vtt'],
              difficultyMin: 2,
              difficultyMax: 4,
              distanceMinKm: 5,
              durationMaxH: 3,
            },
          },
        ),
      );
      expect(chips.find((c) => c.group === 'hotTaxonomy')?.label).toBe('Sous-catégorie héb. · 1');
      expect(chips.find((c) => c.group === 'hotCapacity')?.label).toBe('Capacité héb. · ≥ 2');
      expect(chips.find((c) => c.group === 'resCapacity')?.label).toBe('Capacité resto · ≤ 60');
      expect(chips.find((c) => c.group === 'itiLoop')?.label).toBe('Itinéraire · Boucle');
      expect(chips.find((c) => c.group === 'itiDifficulty')?.label).toBe('Difficulté · ≥ 2 · ≤ 4');
      expect(chips.find((c) => c.group === 'itiDistance')?.label).toBe('Distance · ≥ 5 km');
      expect(chips.find((c) => c.group === 'itiDuration')?.label).toBe('Durée · ≤ 3 h');
      expect(chips.find((c) => c.group === 'itiPractices')?.label).toBe('Pratique · 2 sélectionnées');
    });
  });
});
