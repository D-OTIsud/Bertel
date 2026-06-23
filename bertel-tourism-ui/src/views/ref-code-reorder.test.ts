import { moveItem } from './ref-code-reorder';

describe('moveItem (Phase 7.5 — réordonnancement des valeurs ref_code)', () => {
  it('monte un élément (échange avec le précédent), liste immuable', () => {
    const src = ['a', 'b', 'c'];
    const out = moveItem(src, 1, -1);
    expect(out).toEqual(['b', 'a', 'c']);
    expect(src).toEqual(['a', 'b', 'c']); // source non mutée
  });

  it('descend un élément (échange avec le suivant)', () => {
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'c', 'b']);
  });

  it('no-op hors bornes (premier vers le haut / dernier vers le bas)', () => {
    expect(moveItem(['a', 'b', 'c'], 0, -1)).toEqual(['a', 'b', 'c']);
    expect(moveItem(['a', 'b', 'c'], 2, 1)).toEqual(['a', 'b', 'c']);
  });
});
