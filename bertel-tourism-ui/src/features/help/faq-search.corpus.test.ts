/** Garde de QUALITÉ de la recherche sur le corpus réel : les mots métier phares
 *  doivent remonter la bonne entrée en tête. Si un remaniement du contenu casse
 *  un de ces cas, c'est une régression produit, pas un détail. */
import { ALL_FAQ_ENTRIES } from './content';
import { searchFaq } from './faq-search';

function topIds(query: string, n = 3): string[] {
  return searchFaq(ALL_FAQ_ENTRIES, query).slice(0, n).map((e) => e.id);
}

describe('recherche métier sur le corpus réel', () => {
  test('« artisan » → l’arbitrage artisan en premier', () => {
    expect(topIds('artisan')[0]).toBe('choisir-artisan');
  });

  test('« artis » (préfixe) trouve aussi l’arbitrage artisan', () => {
    expect(topIds('artis')).toContain('choisir-artisan');
  });

  test('« gîte » → la fiche création HLO dans le top 3', () => {
    expect(topIds('gîte')).toContain('creer-hlo');
  });

  test('« atelier » → l’arbitrage artisan ET la création ACT dans le top 3', () => {
    const ids = topIds('atelier');
    expect(ids).toContain('choisir-artisan');
    expect(ids).toContain('creer-act');
  });

  test('« publier » → publier-fiche en premier', () => {
    expect(topIds('publier')[0]).toBe('publier-fiche');
  });

  test('« mot de passe » → la réinitialisation dans le top 3', () => {
    expect(topIds('mot de passe')).toContain('mot-de-passe-oublie');
  });

  test('« marché » → l’arbitrage marché dans le top 3', () => {
    expect(topIds('marché')).toContain('choisir-marche');
  });

  test('« dashboard » → dashboard-comprendre dans le top 3', () => {
    expect(topIds('dashboard')).toContain('dashboard-comprendre');
  });

  test('« qualité » → une entrée Dashboard pertinente dans le top 3', () => {
    const ids = topIds('qualité');
    expect(ids.some((id) => id.startsWith('dashboard-'))).toBe(true);
  });

  test('« audit » → modules-audits-publications', () => {
    expect(topIds('audit')).toContain('modules-audits-publications');
  });

  test('« publication » → publier-fiche et modules-audits-publications restent découvrables', () => {
    const ids = topIds('publication', 5);
    expect(ids).toContain('publier-fiche');
    expect(ids).toContain('modules-audits-publications');
  });

  test('« intégrateur » trouve le guide partenaires API', () => {
    expect(topIds('intégrateur')).toContain('aide-partenaires');
  });

  test('« api partenaire » trouve le guide partenaires API', () => {
    expect(topIds('api partenaire', 5)).toContain('aide-partenaires');
  });
});
