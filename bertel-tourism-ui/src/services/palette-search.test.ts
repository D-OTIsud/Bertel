import { searchPaletteObjects, PALETTE_SEARCH_MIN_CHARS } from './palette-search';
import { searchObjectsByName, type NameMatch } from './name-search';
import { listObjectMarkers } from './rpc';

jest.mock('./name-search', () => ({
  NAME_MATCH_MIN_CHARS: 2,
  searchObjectsByName: jest.fn(async () => []),
}));

// Garde du rebranchement : si la palette repassait par le RPC des marqueurs,
// ce module serait chargé et ce mock appelé — donc l'assertion plus bas rougit.
jest.mock('./rpc', () => ({
  listObjectMarkers: jest.fn(async () => []),
}));

const searchByNameMock = searchObjectsByName as jest.MockedFunction<typeof searchObjectsByName>;
const listMarkersMock = listObjectMarkers as jest.MockedFunction<typeof listObjectMarkers>;

function match(overrides: Partial<NameMatch> = {}): NameMatch {
  return {
    id: 'HOT-1',
    name: 'Hotel Basalte & Lagon',
    type: 'HOT',
    status: 'published',
    city: 'Saint-Pierre',
    imageUrl: 'https://cdn.example/basalte.jpg',
    ...overrides,
  };
}

describe('searchPaletteObjects (D24 — recherche par nom)', () => {
  beforeEach(() => {
    searchByNameMock.mockReset();
    listMarkersMock.mockReset();
    searchByNameMock.mockResolvedValue([]);
  });

  it('mappe une correspondance de nom vers la forme ObjectCard attendue par la palette', async () => {
    searchByNameMock.mockResolvedValue([match()]);

    const results = await searchPaletteObjects('basalte');

    expect(searchByNameMock).toHaveBeenCalledTimes(1);
    expect(searchByNameMock).toHaveBeenCalledWith('basalte');
    expect(results).toEqual([
      {
        id: 'HOT-1',
        type: 'HOT',
        name: 'Hotel Basalte & Lagon',
        image: 'https://cdn.example/basalte.jpg',
        open_now: null,
        location: { lat: null, lon: null, city: 'Saint-Pierre' },
      },
    ]);
  });

  it('rend une commune et une image absentes en null plutôt qu’en undefined', async () => {
    searchByNameMock.mockResolvedValue([match({ city: null, imageUrl: null })]);

    const [card] = await searchPaletteObjects('basalte');

    expect(card.image).toBeNull();
    expect(card.location).toEqual({ lat: null, lon: null, city: null });
  });

  it('renvoie [] sous le seuil de caractères, SANS interroger le serveur', async () => {
    expect(PALETTE_SEARCH_MIN_CHARS).toBe(2);
    expect(await searchPaletteObjects('a')).toEqual([]);
    expect(await searchPaletteObjects('  b  ')).toEqual([]);
    expect(searchByNameMock).not.toHaveBeenCalled();
  });

  it('plafonne la liste à 8 fiches', async () => {
    searchByNameMock.mockResolvedValue(
      Array.from({ length: 12 }, (_, index) => match({ id: `HOT-${index}`, name: `Fiche ${index}` })),
    );

    const results = await searchPaletteObjects('fiche');

    expect(results).toHaveLength(8);
    expect(results.at(-1)?.id).toBe('HOT-7');
  });

  it('ne passe plus par le RPC des marqueurs de carte (fiches non géolocalisées trouvables)', async () => {
    searchByNameMock.mockResolvedValue([match({ city: null })]);

    await searchPaletteObjects('basalte');

    expect(listMarkersMock).not.toHaveBeenCalled();
  });
});
