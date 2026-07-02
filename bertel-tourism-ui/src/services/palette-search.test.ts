import { searchPaletteObjects } from './palette-search';
import { useSessionStore } from '../store/session-store';

describe('searchPaletteObjects (D24 — démo)', () => {
  beforeEach(() => {
    useSessionStore.setState({ demoMode: true, canEditObjects: true });
  });

  it('trouve une fiche du corpus démo par son nom', async () => {
    const results = await searchPaletteObjects('basalte');
    expect(results.map((card) => card.name)).toContain('Hotel Basalte & Lagon');
  });

  it('renvoie [] sous le seuil de caractères', async () => {
    expect(await searchPaletteObjects('a')).toEqual([]);
  });
});
