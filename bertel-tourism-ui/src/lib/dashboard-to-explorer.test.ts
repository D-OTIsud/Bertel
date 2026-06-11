import { mapDashboardFiltersToExplorerUrl } from './dashboard-to-explorer';

describe('mapDashboardFiltersToExplorerUrl', () => {
  it('mappe types → buckets (+ hotSubtypes), cities, pmr, pets, labels, statuses', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT', 'CAMP', 'RES'],
      status: ['published', 'draft'],
      cities: ['Le Tampon'],
      pmr: true,
      petsAccepted: true,
      labelsAny: ['famille-plus'],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(url.startsWith('/explorer?')).toBe(true);
    // HOT bucket covers the full HOT family; RES maps to itself.
    expect(params.get('buckets')!.split(',').sort()).toEqual(['HOT', 'RES']);
    // hotSubtypes: ['HOT','CAMP'] — not the full HOT family (5 types) → serialized
    expect(params.get('hotSubtypes')!.split(',').sort()).toEqual(['CAMP', 'HOT']);
    expect(params.get('cities')).toBe('Le Tampon');
    // pmr=true → serialized as 'true'; pmr=false → omitted (buildSearchParams only sets when true)
    expect(params.get('pmr')).toBe('true');
    // petsAccepted=true → pets='true'
    expect(params.get('pets')).toBe('true');
    expect(params.get('labels')).toBe('famille-plus');
    // statuses non-empty → serialized
    expect(params.get('status')).toBe('published,draft');
    expect(dropped).toEqual([]);
  });

  it('liste les champs non transposables dans dropped', () => {
    const { dropped } = mapDashboardFiltersToExplorerUrl({
      updatedAtFrom: '2026-01-01',
      classificationsAny: [{ schemeCode: 'hot_stars', valueCode: '4' }],
      languagesAny: ['en'],
      amenityFamiliesAny: ['wellness'],
      lieuDits: ['A', 'B'],
      status: ['archived'],
      taxonomyAny: [{ domain: 'taxonomy_res', code: 'creole' }],
    });
    expect(dropped).toEqual(
      expect.arrayContaining([
        'période de mise à jour',
        'distinctions',
        'langues',
        "familles d'équipements",
        'lieux-dits supplémentaires',
        'statut archivé/masqué',
        'catégories hors hébergement',
      ]),
    );
  });

  it('transpose la taxonomie taxonomy_hot vers hotTaxonomy', () => {
    const { url } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT'],
      taxonomyAny: [{ domain: 'taxonomy_hot', code: 'hotel' }],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('hotTaxonomy')).toBe('taxonomy_hot:hotel');
  });

  it('sans filtre, renvoie /explorer nu', () => {
    const { url } = mapDashboardFiltersToExplorerUrl({});
    expect(url).toBe('/explorer');
  });

  it("signale l'élargissement de bucket pour un type partiel (LOI → bucket ACT)", () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({ types: ['LOI'] });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('buckets')).toBe('ACT');
    expect(dropped).toEqual(
      expect.arrayContaining([expect.stringContaining('LOI')]),
    );
  });

  it("ne signale rien quand la famille du bucket est couverte en entier", () => {
    const { dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['COM', 'PSV', 'ASC', 'SPU'],
    });
    expect(dropped).toEqual([]);
  });
});
