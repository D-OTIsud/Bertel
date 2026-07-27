import { CRM_SEARCH_MIN_LENGTH, effectiveCrmSearch, useCrmSearchStore } from './crm-search-store';

describe('crm-search-store', () => {
  beforeEach(() => useCrmSearchStore.setState({ search: '' }));

  it('expose la recherche et son setter', () => {
    useCrmSearchStore.getState().setSearch('hoareau');
    expect(useCrmSearchStore.getState().search).toBe('hoareau');
  });
});

// Le seuil reflète le contrat serveur : sous 2 caractères utiles, api.list_crm_directory
// ignore p_search. Ne rien envoyer évite un aller-retour dont le résultat serait identique
// à l'annuaire complet.
describe('effectiveCrmSearch', () => {
  it('rend undefined sous le seuil — y compris pour des espaces seuls', () => {
    expect(effectiveCrmSearch('')).toBeUndefined();
    expect(effectiveCrmSearch('a')).toBeUndefined();
    expect(effectiveCrmSearch('   ')).toBeUndefined();
    expect(effectiveCrmSearch(' a ')).toBeUndefined();
  });

  it('rend le terme rogné dès le seuil atteint', () => {
    expect(effectiveCrmSearch('ho')).toBe('ho');
    expect(effectiveCrmSearch('  hoareau  ')).toBe('hoareau');
    expect(CRM_SEARCH_MIN_LENGTH).toBe(2);
  });
});
