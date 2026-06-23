import { buildExplorerErrorBanner } from './explorer-error';

describe('buildExplorerErrorBanner', () => {
  it('renvoie null quand aucune requête n’est en erreur (pas de remplacement de page)', () => {
    expect(buildExplorerErrorBanner(false, false)).toBeNull();
  });

  it('cible les résultats quand seule la requête cartes échoue', () => {
    const b = buildExplorerErrorBanner(true, false);
    expect(b).not.toBeNull();
    expect(b!.title).toMatch(/résultats/i);
  });

  it('cible les filtres quand seules les références échouent', () => {
    const b = buildExplorerErrorBanner(false, true);
    expect(b!.title).toMatch(/filtres/i);
  });

  it('couvre les deux quand tout échoue', () => {
    const b = buildExplorerErrorBanner(true, true);
    expect(b!.title).toMatch(/Explorateur/i);
    expect(b!.description.length).toBeGreaterThan(0);
  });
});
