import type { ObjectCard } from '../../types/domain';
import { TABLE_COLUMNS, buildTableCsv, sortCards } from './table-columns';
import { ALL_TABLE_COLUMN_IDS, DEFAULT_TABLE_COLUMNS } from '../../store/explorer-view-store';

function card(partial: Partial<ObjectCard> & { id: string; name: string }): ObjectCard {
  return { type: 'HOT', ...partial };
}

const CARDS: ObjectCard[] = [
  card({ id: 'b', name: 'Écrin des Hauts', rating: 4.6, location: { city: 'Cilaos' }, updated_at: '2026-05-01T00:00:00Z' }),
  card({ id: 'a', name: 'Auberge du Sud', rating: null, location: { city: 'Saint-Joseph' }, updated_at: '2026-06-15T00:00:00Z' }),
  card({ id: 'c', name: 'Zot Kaz', rating: 3.2, location: {}, updated_at: null }),
];

describe('sortCards (D17 — tri client des pages chargées)', () => {
  it('trie par nom avec la collation française (É ≈ E)', () => {
    const asc = sortCards(CARDS, { columnId: 'name', dir: 'asc' }).map((c) => c.id);
    expect(asc).toEqual(['a', 'b', 'c']);
    const desc = sortCards(CARDS, { columnId: 'name', dir: 'desc' }).map((c) => c.id);
    expect(desc).toEqual(['c', 'b', 'a']);
  });

  it('les valeurs nulles vont en fin de liste quel que soit le sens', () => {
    const asc = sortCards(CARDS, { columnId: 'rating', dir: 'asc' }).map((c) => c.id);
    expect(asc).toEqual(['c', 'b', 'a']); // a (null) en dernier
    const desc = sortCards(CARDS, { columnId: 'rating', dir: 'desc' }).map((c) => c.id);
    expect(desc).toEqual(['b', 'c', 'a']);
  });

  it('tri des dates sur le timestamp (pas la chaîne formatée)', () => {
    const asc = sortCards(CARDS, { columnId: 'updated', dir: 'asc' }).map((c) => c.id);
    expect(asc).toEqual(['b', 'a', 'c']); // c (null) en dernier
  });

  it('sans tri ou colonne non triable : ordre serveur inchangé', () => {
    expect(sortCards(CARDS, null).map((c) => c.id)).toEqual(['b', 'a', 'c']);
    expect(sortCards(CARDS, { columnId: 'labels', dir: 'asc' }).map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });

  it('ne mute pas le tableau d’entrée', () => {
    const input = [...CARDS];
    sortCards(input, { columnId: 'name', dir: 'asc' });
    expect(input.map((c) => c.id)).toEqual(['b', 'a', 'c']);
  });
});

describe('buildTableCsv (D17 — colonnes visibles, cellules gardées SEC-2)', () => {
  it('émet l’en-tête (id + libellés) et une ligne par carte', () => {
    const csv = buildTableCsv(CARDS, ['name', 'city']);
    const lines = csv.split('\n');
    expect(lines[0]).toBe('"id";"Nom";"Commune"');
    expect(lines).toHaveLength(4);
    expect(lines[1]).toBe('"b";"Écrin des Hauts";"Cilaos"');
  });

  it('neutralise les cellules à meneur de formule (= + - @)', () => {
    const trap = card({ id: 'x', name: '=SUM(A1:A9)' });
    const csv = buildTableCsv([trap], ['name']);
    expect(csv.split('\n')[1]).toContain('"\'=SUM(A1:A9)"');
  });

  it('ignore les ids de colonnes inconnus', () => {
    const csv = buildTableCsv(CARDS, ['name', 'ghost']);
    expect(csv.split('\n')[0]).toBe('"id";"Nom"');
  });
});

describe('§204 — colonne Remplissage', () => {
  it('existe, est optionnelle (masquée par défaut) et déclarée dans le registre canonique', () => {
    expect(TABLE_COLUMNS.remplissage).toBeDefined();
    expect(TABLE_COLUMNS.remplissage.label).toBe('Remplissage');
    expect(DEFAULT_TABLE_COLUMNS).not.toContain('remplissage');
    expect(ALL_TABLE_COLUMN_IDS).toContain('remplissage');
  });

  it('trie par nombre de manquants, le champ absent en dernier', () => {
    const sort = TABLE_COLUMNS.remplissage.sortValue!;
    expect(sort(card({ id: 'x', name: 'x', missing_essentials: ['a', 'b'] }))).toBe(2);
    expect(sort(card({ id: 'y', name: 'y', missing_essentials: [] }))).toBe(0);
    expect(sort(card({ id: 'z', name: 'z' }))).toBeNull();
  });

  it('le CSV porte les libellés lisibles, pas un compte muet', () => {
    const csv = TABLE_COLUMNS.remplissage.csvValue;
    expect(csv(card({ id: 'x', name: 'x', missing_essentials: ['photos'] }))).toBe('Photos');
    expect(csv(card({ id: 'y', name: 'y', missing_essentials: [] }))).toBe('complète');
    expect(csv(card({ id: 'z', name: 'z' }))).toBe('');
  });
});
