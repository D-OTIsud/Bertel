import { mapDashboardFiltersToExplorerUrl } from './dashboard-to-explorer';

describe('mapDashboardFiltersToExplorerUrl', () => {
  it('mappe types → buckets (+ hotSubtypes), cities, pmr, pets, statuses', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT', 'CAMP', 'RES'],
      status: ['published', 'draft'],
      cities: ['Le Tampon'],
      pmr: true,
      petsAccepted: true,
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
      labelsAny: ['famille-plus'],
      lieuDits: ['A', 'B'],
      status: ['archived'],
      taxonomyAny: [{ domain: 'taxonomy_org', code: 'office' }],
    });
    expect(dropped).toEqual(
      expect.arrayContaining([
        'période de mise à jour',
        'distinctions',
        'langues',
        "familles d'équipements",
        'tags',
        'lieux-dits supplémentaires',
        'statut archivé/masqué',
        'catégories hors Explorer',
      ]),
    );
  });

  it('transpose la taxonomie de TOUS les domaines vers common.taxonomyAny (§155)', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT', 'RES'],
      taxonomyAny: [
        { domain: 'taxonomy_hot', code: 'hotel' },
        { domain: 'taxonomy_res', code: 'pizzeria' },
      ],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('taxonomy')).toBe('taxonomy_hot:hotel,taxonomy_res:pizzeria');
    expect(dropped).toEqual(expect.not.arrayContaining(['catégories hors Explorer']));
  });

  it('sans filtre, renvoie /explorer nu', () => {
    const { url } = mapDashboardFiltersToExplorerUrl({});
    expect(url).toBe('/explorer');
  });

  it("signale l'élargissement de bucket pour un type partiel (LOI → bucket VIS, §2a)", () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({ types: ['LOI'] });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('buckets')).toBe('VIS'); // §2a : Loisir = archétype VIS
    expect(dropped).toEqual(
      expect.arrayContaining([expect.stringContaining('LOI')]),
    );
  });

  it("ne signale rien quand la famille du bucket est couverte en entier", () => {
    const { dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['PSV', 'VIL', 'COM', 'SPU'], // §2a : famille SRV complète (VIL dedans, ASC sorti)
    });
    expect(dropped).toEqual([]);
  });

  it("droppe les tags (aucun équivalent serveur côté Explorer) sans les sérialiser", () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({ labelsAny: ['famille-plus'] });
    expect(dropped).toEqual(['tags']);
    expect(url).toBe('/explorer');
  });
});

describe("§155-bis — paires dont le bucket n'est pas sélectionné", () => {
  it('les drop avec signalement (jamais de chip inerte côté Explorer)', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      types: ['HOT'],
      taxonomyAny: [
        { domain: 'taxonomy_hot', code: 'hotel' },
        { domain: 'taxonomy_res', code: 'pizzeria' }, // RES non sélectionné
      ],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('taxonomy')).toBe('taxonomy_hot:hotel');
    expect(dropped).toEqual(expect.arrayContaining(["catégories dont le type n'est pas sélectionné"]));
  });

  it('sans sélection de type, tout passe (tous les buckets actifs)', () => {
    const { url, dropped } = mapDashboardFiltersToExplorerUrl({
      taxonomyAny: [{ domain: 'taxonomy_res', code: 'pizzeria' }],
    });
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('taxonomy')).toBe('taxonomy_res:pizzeria');
    expect(dropped).toEqual([]);
  });
});
