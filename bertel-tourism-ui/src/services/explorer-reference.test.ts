import { buildTaxonomyDomains, toRankedLabelSchemeValues } from './explorer-reference';

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
