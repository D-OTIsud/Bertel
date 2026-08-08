import { groupByFamily, type RefCatalogSummary } from './ref-catalogs';

const cat = (over: Partial<RefCatalogSummary>): RefCatalogSummary => ({
  catalogKey: 'ref_x', kind: 'table', label: 'X', family: 'Juridique et conformité',
  usedIn: null, access: 'editable', readonlyReason: null, nValues: 0, ...over,
});

describe('groupByFamily', () => {
  it('regroupe par famille et trie les familles alphabetiquement', () => {
    expect(groupByFamily([
      cat({ label: 'B', family: 'Restauration' }),
      cat({ label: 'A', family: 'Hébergement' }),
    ]).map((g) => g.family)).toEqual(['Hébergement', 'Restauration']);
  });

  it('place « A classer » en dernier, quel que soit l alphabet', () => {
    expect(groupByFamily([
      cat({ label: 'A', family: 'À classer' }),
      cat({ label: 'B', family: 'Restauration' }),
    ]).at(-1)?.family).toBe('À classer');
  });

  it('trie les catalogues par libelle dans une famille', () => {
    expect(groupByFamily([
      cat({ label: 'Zèbre', family: 'Hébergement' }),
      cat({ label: 'Abeille', family: 'Hébergement' }),
    ])[0].catalogs.map((c) => c.label)).toEqual(['Abeille', 'Zèbre']);
  });
});
