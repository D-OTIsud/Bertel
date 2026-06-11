import { buildRpcParams } from './dashboard-rpc';

describe('buildRpcParams', () => {
  it('sérialise les filtres existants (régression)', () => {
    const params = buildRpcParams({
      types: ['HOT'],
      status: ['published'],
      cities: ['Le Tampon'],
      lieuDits: ['La Plaine'],
      labelsAny: ['famille-plus'],
      taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
      petsAccepted: true,
      pmr: true,
      updatedAtFrom: '2026-01-01',
      updatedAtTo: '2026-06-01',
    });
    expect(params).toEqual({
      p_types: ['HOT'],
      p_status: ['published'],
      p_filters: {
        city_any: ['Le Tampon'],
        lieu_dit_any: ['La Plaine'],
        tags_any: ['famille-plus'],
        taxonomy_any: [{ domain: 'taxonomy_hot', code: 'hotel' }],
        pet_accepted: true,
        amenities_any: ['wheelchair_access'],
      },
      p_updated_at_from: '2026-01-01',
      p_updated_at_to: '2026-06-01',
    });
  });

  it('sérialise les nouvelles clés avancées', () => {
    const params = buildRpcParams({
      classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
      amenityFamiliesAny: ['wellness'],
      languagesAny: ['en', 'de'],
    });
    expect(params.p_filters).toEqual({
      classifications_any: [{ scheme_code: 'hot_stars', value_code: '4' }],
      amenity_families_any: ['wellness'],
      languages_any: ['en', 'de'],
    });
    expect(params.p_types).toBeNull();
    expect(params.p_status).toBeNull();
  });

  it('omet les clés vides', () => {
    expect(buildRpcParams({}).p_filters).toEqual({});
  });

  it('omet les tableaux vides pour les nouvelles clés', () => {
    expect(
      buildRpcParams({
        classificationsAny: [],
        amenityFamiliesAny: [],
        languagesAny: [],
      }).p_filters,
    ).toEqual({});
  });
});
