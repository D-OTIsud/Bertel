import type { FaqEntry } from './content/types';
import { normalizeFaqText, searchFaq } from './faq-search';

function entry(partial: Partial<FaqEntry> & Pick<FaqEntry, 'id'>): FaqEntry {
  return {
    rubrique: 'demarrer',
    question: partial.id,
    answer: 'réponse',
    keywords: ['x-key'],
    ...partial,
  };
}

describe('normalizeFaqText', () => {
  test('minuscules + accents strippés', () => {
    expect(normalizeFaqText('Gîte à l\'Étang-Salé')).toBe('gite a l\'etang-sale');
  });
});

describe('searchFaq', () => {
  const corpus: FaqEntry[] = [
    entry({ id: 'a-keyword', keywords: ['artisan', 'boutique'], answer: 'rien ici' }),
    entry({ id: 'b-question', question: 'Créer un artisan ?', keywords: ['zzz'], answer: 'rien' }),
    entry({ id: 'c-answer', keywords: ['zzz'], answer: 'un artisan qui vend' }),
    entry({ id: 'd-nomatch', keywords: ['zzz'], answer: 'rien', question: 'rien' }),
  ];

  test('requête vide ou blanche → []', () => {
    expect(searchFaq(corpus, '')).toEqual([]);
    expect(searchFaq(corpus, '   ')).toEqual([]);
  });

  test('préfixe : « artis » matche artisan ; « d-nomatch » exclu', () => {
    const ids = searchFaq(corpus, 'artis').map((e) => e.id);
    expect(ids).toContain('a-keyword');
    expect(ids).not.toContain('d-nomatch');
  });

  test('pondération : keyword > question > answer', () => {
    expect(searchFaq(corpus, 'artisan').map((e) => e.id)).toEqual([
      'a-keyword', 'b-question', 'c-answer',
    ]);
  });

  test('insensible aux accents dans les deux sens', () => {
    const c = [entry({ id: 'gite', keywords: ['gîte'] })];
    expect(searchFaq(c, 'gite').map((e) => e.id)).toEqual(['gite']);
    expect(searchFaq(c, 'GÎTE').map((e) => e.id)).toEqual(['gite']);
  });

  test('multi-tokens = ET : chaque token doit matcher quelque part', () => {
    const c = [
      entry({ id: 'both', keywords: ['artisan'], answer: 'propose des ateliers' }),
      entry({ id: 'one', keywords: ['artisan'], answer: 'rien' }),
    ];
    expect(searchFaq(c, 'artisan atelier').map((e) => e.id)).toEqual(['both']);
  });

  test('les codes types matchent aussi (« hlo »)', () => {
    const c = [entry({ id: 'hlo', types: ['HLO'], keywords: ['gîte'] })];
    expect(searchFaq(c, 'hlo').map((e) => e.id)).toEqual(['hlo']);
  });

  test('départage stable à score égal : ordre rubrique puis id', () => {
    const c = [
      entry({ id: 'z-late', rubrique: 'crm', keywords: ['artisan'] }),
      entry({ id: 'a-early', rubrique: 'demarrer', keywords: ['artisan'] }),
    ];
    expect(searchFaq(c, 'artisan').map((e) => e.id)).toEqual(['a-early', 'z-late']);
  });
});
