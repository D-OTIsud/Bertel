import { resolveSelectionHydrationIds, SELECTION_HYDRATION_LIMIT } from './selection-hydration';

function resolve(overrides: Partial<Parameters<typeof resolveSelectionHydrationIds>[0]> = {}) {
  return resolveSelectionHydrationIds({
    selectedObjectIds: [],
    selectedCardId: null,
    loadedCardIds: [],
    corpusObjectIds: [],
    enabled: true,
    ...overrides,
  });
}

describe('resolveSelectionHydrationIds', () => {
  it('ne retient que les sélections absentes de la fenêtre chargée', () => {
    expect(
      resolve({
        selectedObjectIds: ['a', 'far'],
        loadedCardIds: ['a', 'b'],
        corpusObjectIds: ['a', 'b', 'far'],
      }),
    ).toEqual(['far']);
  });

  it("conserve l'ordre d'ajout du panier", () => {
    expect(
      resolve({
        selectedObjectIds: ['z', 'y', 'x'],
        corpusObjectIds: ['x', 'y', 'z'],
      }),
    ).toEqual(['z', 'y', 'x']);
  });

  it('place la fiche cliquée sur la carte en premier, sans la dupliquer', () => {
    expect(
      resolve({
        selectedObjectIds: ['a', 'pin'],
        selectedCardId: 'pin',
        corpusObjectIds: ['a', 'pin'],
      }),
    ).toEqual(['pin', 'a']);
  });

  it('écarte une sélection sortie du corpus filtré', () => {
    // D25 : la sélection survit à un changement de filtre — la liste des résultats,
    // elle, ne doit montrer que ce qui correspond aux filtres actifs.
    expect(
      resolve({
        selectedObjectIds: ['stale', 'ok'],
        corpusObjectIds: ['ok'],
      }),
    ).toEqual(['ok']);
  });

  it('ne réclame rien tant que le corpus est inconnu', () => {
    // Marqueurs pas encore chargés : réclamer à l'aveugle injecterait des fiches
    // qui ne correspondent peut-être pas aux filtres.
    expect(resolve({ selectedObjectIds: ['a'], corpusObjectIds: [] })).toEqual([]);
  });

  it('ne réclame rien quand le flottement est suspendu', () => {
    expect(
      resolve({ selectedObjectIds: ['a'], corpusObjectIds: ['a'], enabled: false }),
    ).toEqual([]);
  });

  it('borne la réclamation au plafond, en gardant les premiers du panier', () => {
    const many = Array.from({ length: SELECTION_HYDRATION_LIMIT + 50 }, (_, i) => `m${i}`);
    const resolved = resolve({ selectedObjectIds: many, corpusObjectIds: many });
    expect(resolved).toHaveLength(SELECTION_HYDRATION_LIMIT);
    expect(resolved[0]).toBe('m0');
    expect(resolved.at(-1)).toBe(`m${SELECTION_HYDRATION_LIMIT - 1}`);
  });

  it('dédoublonne un id présent deux fois dans le panier', () => {
    expect(resolve({ selectedObjectIds: ['a', 'a'], corpusObjectIds: ['a'] })).toEqual(['a']);
  });
});
