jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
jest.mock('../store/session-store', () => ({
  useSessionStore: { getState: jest.fn(() => ({ demoMode: false })) },
}));

import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { listExplorerCardsByIds } from './rpc';

const mockGetApiClient = getApiClient as jest.Mock;
const mockGetState = useSessionStore.getState as jest.Mock;

function card(id: string) {
  return { id, type: 'RES', name: `Fiche ${id}`, tags: [], taxonomy: [], badges: [] };
}

describe('listExplorerCardsByIds (§125 bis — cartes sélectionnées réclamées par id)', () => {
  const rpc = jest.fn();

  beforeEach(() => {
    rpc.mockReset();
    mockGetState.mockReset();
    mockGetState.mockReturnValue({ demoMode: false });
    mockGetApiClient.mockReset();
    mockGetApiClient.mockReturnValue({ schema: () => ({ rpc }) });
  });

  function respond({ cards, essentials }: { cards?: unknown; essentials?: unknown } = {}) {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_object_cards_batch'
          ? { data: cards ?? [], error: null }
          : { data: essentials ?? [], error: null },
      ),
    );
  }

  it('réclame get_object_cards_batch avec les ids dédoublonnés et nettoyés', async () => {
    respond({ cards: [card('a')] });

    await listExplorerCardsByIds([' a ', 'a', ''], ['fr']);

    expect(rpc).toHaveBeenCalledWith('get_object_cards_batch', { p_ids: ['a'], p_lang_prefs: ['fr'] });
  });

  it("n'émet aucune requête pour une liste d'ids vide", async () => {
    respond();
    await expect(listExplorerCardsByIds([], ['fr'])).resolves.toEqual([]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('rattache missing_essentials, que get_object_cards_batch ne porte pas', async () => {
    // §204 — sans ce rattachement, une fiche remontée par la sélection perdrait la
    // pastille « N manquants » que la même fiche affiche quand elle vient de la pagination.
    respond({
      cards: [card('a'), card('b')],
      essentials: [{ object_id: 'a', missing: ['contact', 'photos'] }],
    });

    const cards = await listExplorerCardsByIds(['a', 'b'], ['fr']);

    expect(rpc).toHaveBeenCalledWith('object_missing_essentials', { p_object_ids: ['a', 'b'] });
    expect(cards.find((c) => c.id === 'a')?.missing_essentials).toEqual(['contact', 'photos']);
    // Aucune ligne pour « b » ⇒ champ ABSENT, jamais un tableau vide : un tableau vide
    // signifierait « fiche complète », ce que le serveur n'a pas dit.
    expect(cards.find((c) => c.id === 'b')).not.toHaveProperty('missing_essentials');
  });

  it('laisse missing_essentials absent quand le volet remplissage échoue', async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_object_cards_batch'
          ? { data: [card('a')], error: null }
          : { data: null, error: { message: 'boom' } },
      ),
    );

    const cards = await listExplorerCardsByIds(['a'], ['fr']);

    expect(cards).toHaveLength(1);
    expect(cards[0]).not.toHaveProperty('missing_essentials');
  });

  it('propage une erreur du volet cartes', async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'get_object_cards_batch'
          ? { data: null, error: { message: 'boom' } }
          : { data: [], error: null },
      ),
    );

    await expect(listExplorerCardsByIds(['a'], ['fr'])).rejects.toEqual({ message: 'boom' });
  });
});
