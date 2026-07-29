import type { ExplorerTaxonomyDomain } from '../types/domain';
import {
  buildTaxonomyDomains,
  projectLegacyOutdoorAccommodationFamilies,
  projectLegacyOutdoorAccommodationTaxonomies,
  toRankedLabelSchemeValues,
} from './explorer-reference';

describe('toRankedLabelSchemeValues', () => {
  it('groups grade values by scheme code, sorted ascending, numeric-aware', () => {
    const rows = [
      { code: '3', name: '3 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: '1', name: '1 étoile', position: null, scheme: { code: 'hot_stars' } },
      { code: '5', name: '5 étoiles', position: null, scheme: { code: 'hot_stars' } },
      { code: 'granted', name: 'Obtenu', position: null, scheme: { code: 'LBL_CLEF_VERTE' } },
    ];
    const out = toRankedLabelSchemeValues(rows);
    expect(out.hot_stars.map((v) => v.code)).toEqual(['1', '3', '5']);
    expect(out.hot_stars[0]).toEqual({ code: '1', name: '1 étoile' });
    expect(out.LBL_CLEF_VERTE.map((v) => v.code)).toEqual(['granted']);
  });

  it('drops rows without a scheme code or value code', () => {
    const out = toRankedLabelSchemeValues([
      { code: '', name: 'x', position: null, scheme: { code: 'hot_stars' } },
      { code: '2', name: '2 étoiles', position: null, scheme: null },
    ]);
    expect(out).toEqual({});
  });
});

describe('buildTaxonomyDomains — vocabulaire hébergement §192', () => {
  it('expose l’axe, la famille, les alias Berta et la référence normative', () => {
    const domains = buildTaxonomyDomains(
      [{ domain: 'taxonomy_hlo', name: 'Hébergement', object_type: 'HLO', position: 1 }],
      [{
        id: 'root', domain: 'taxonomy_hlo', code: 'root', name: 'Racine', description: null,
        parent_id: null, is_assignable: false, position: 0, metadata: {},
      }, {
        id: 'meuble', domain: 'taxonomy_hlo', code: 'location_saisonniere', name: 'Meublé de tourisme',
        description: 'Villa, appartement ou studio meublé.', parent_id: 'root', is_assignable: true, position: 1,
        metadata: {
          axis: 'nature', famille: 'locatif', aliases: ['Location saisonnière', 'Gîte'],
          source_ref: 'Code du tourisme art. D324-1',
        },
      }],
    );

    expect(domains[0].nodes[0]).toMatchObject({
      code: 'location_saisonniere',
      axis: 'nature',
      family: 'locatif',
      aliases: ['Location saisonnière', 'Gîte'],
      sourceRef: 'Code du tourisme art. D324-1',
      description: 'Villa, appartement ou studio meublé.',
    });
  });
});

describe('projection de compatibilité §201 — ancien catalogue plein_air', () => {
  it('remplace la quatrième famille historique par les deux familles validées', () => {
    const result = projectLegacyOutdoorAccommodationFamilies([
      { code: 'hotellerie', name: 'Hôtellerie', position: 1 },
      { code: 'locatif', name: 'Hébergement locatif', position: 2 },
      { code: 'collectif', name: 'Hébergement collectif', position: 3 },
      { code: 'plein_air', name: 'Hôtellerie de plein air', position: 4 },
    ]);

    expect(result.map(({ code, name }) => ({ code, name }))).toEqual([
      { code: 'hotellerie', name: 'Hôtellerie' },
      { code: 'locatif', name: 'Hébergement locatif' },
      { code: 'collectif', name: 'Hébergement collectif' },
      { code: 'campings_terrains', name: 'Campings et terrains' },
      { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air' },
    ]);
    expect(result.some((family) => family.code === 'plein_air')).toBe(false);
    expect(result.slice(3).every((family) => family.aliases?.includes('Hôtellerie de plein air'))).toBe(true);
  });

  it('reste idempotente pendant une transition où ancien et nouveaux codes coexistent', () => {
    const once = projectLegacyOutdoorAccommodationFamilies([
      { code: 'plein_air', name: 'Hôtellerie de plein air', position: 4 },
      { code: 'campings_terrains', name: 'Ancien libellé temporaire', position: 8 },
      { code: 'aires_haltes_plein_air', name: 'Aires et haltes de plein air', position: 9 },
    ]);
    const twice = projectLegacyOutdoorAccommodationFamilies(once);

    expect(twice).toEqual(once);
    expect(twice.map((family) => family.code)).toEqual([
      'campings_terrains',
      'aires_haltes_plein_air',
    ]);
    expect(twice[0].name).toBe('Campings et terrains');
  });

  it('répartit les nœuds live connus sans changer leurs vrais domaine et code', () => {
    const domains: ExplorerTaxonomyDomain[] = [
      {
        domain: 'taxonomy_camp', name: 'CAMP', objectType: 'CAMP',
        nodes: [
          { code: 'camping', name: 'Camping', parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
        ],
      },
      {
        domain: 'taxonomy_hpa', name: 'HPA', objectType: 'HPA',
        nodes: [
          { code: 'natural_camp_area', name: 'Aire naturelle', parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
          { code: 'farm_camping', name: 'Camping à la ferme', parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
          { code: 'homestay_camping', name: "Camping chez l'habitant", parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
          { code: 'motorhome_area', name: 'Aire camping-car', parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
          { code: 'outdoor_glamping', name: 'Insolite', parentCode: null, depth: 0, isAssignable: true, axis: 'nature', family: 'plein_air' },
        ],
      },
    ];

    const result = projectLegacyOutdoorAccommodationTaxonomies(domains);
    const camp = result.find((domain) => domain.domain === 'taxonomy_camp')!;
    const hpa = result.find((domain) => domain.domain === 'taxonomy_hpa')!;

    expect(camp.nodes[0]).toMatchObject({ code: 'camping', family: 'campings_terrains' });
    expect(hpa.nodes.filter((node) => ['natural_camp_area', 'farm_camping', 'homestay_camping'].includes(node.code)))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ code: 'natural_camp_area', family: 'campings_terrains' }),
        expect.objectContaining({ code: 'farm_camping', family: 'campings_terrains' }),
        expect.objectContaining({ code: 'homestay_camping', family: 'campings_terrains' }),
      ]));
    expect(hpa.nodes.find((node) => node.code === 'motorhome_area'))
      .toMatchObject({ family: 'aires_haltes_plein_air' });
    expect(hpa.nodes.find((node) => node.code === 'outdoor_glamping'))
      .toMatchObject({ family: null, axis: 'type_unite', isAssignable: false });
  });
});
