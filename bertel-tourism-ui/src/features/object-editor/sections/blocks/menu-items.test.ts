import { addMenuItem, createMenuItem, groupItemsBySection, pruneBlankItems, removeMenuItem, toggleItemCode, updateMenuItem } from './menu-items';

describe('menu-items helpers (§06 P2)', () => {
  it('createMenuItem returns an empty 1-based dish with EUR + available + empty codes', () => {
    const item = createMenuItem(2);
    expect(item).toMatchObject({
      recordId: null,
      name: '',
      price: '',
      currency: 'EUR',
      available: true,
      position: '3',
      dietaryTagCodes: [],
      allergenCodes: [],
      cuisineTypeCodes: [],
    });
  });

  it('addMenuItem appends a fresh dish numbered after the list', () => {
    const list = [createMenuItem(0)];
    const next = addMenuItem(list);
    expect(next).toHaveLength(2);
    expect(next[1].position).toBe('2');
    expect(list).toHaveLength(1); // immutable
  });

  it('updateMenuItem patches one dish immutably', () => {
    const list = [createMenuItem(0), createMenuItem(1)];
    const next = updateMenuItem(list, 1, { name: 'Cari', price: '18' });
    expect(next[1]).toMatchObject({ name: 'Cari', price: '18' });
    expect(next[0]).toBe(list[0]);
    expect(list[1].name).toBe(''); // original untouched
  });

  it('removeMenuItem drops one dish by index', () => {
    const list = [createMenuItem(0), createMenuItem(1)];
    expect(removeMenuItem(list, 0)).toHaveLength(1);
  });

  it('toggleItemCode adds then removes a code', () => {
    expect(toggleItemCode([], 'vegan')).toEqual(['vegan']);
    expect(toggleItemCode(['vegan'], 'vegan')).toEqual([]);
  });

  it('pruneBlankItems drops dishes with no name AND no price, keeps the rest', () => {
    const named = updateMenuItem([createMenuItem(0)], 0, { name: 'Rougail' })[0];
    const priced = updateMenuItem([createMenuItem(1)], 0, { price: '12' })[0];
    const blank = createMenuItem(2);
    expect(pruneBlankItems([named, priced, blank])).toEqual([named, priced]);
  });

  it('createMenuItem stamps the section it was created in', () => {
    const item = createMenuItem(0, 'entree', 'Entrées');
    expect(item).toMatchObject({ sectionCode: 'entree', sectionLabel: 'Entrées' });
  });

  it('groupItemsBySection orders sections by the catalog and keeps each dish flat index', () => {
    const order = [{ code: 'entree', label: 'Entrées' }, { code: 'main', label: 'Plats' }, { code: 'dessert', label: 'Desserts' }];
    const items = [
      createMenuItem(0, 'main', 'Plats'),
      createMenuItem(1, 'entree', 'Entrées'),
      createMenuItem(2, 'main', 'Plats'),
    ];
    const groups = groupItemsBySection(items, order, [{ code: 'dessert', label: 'Desserts' }]);
    expect(groups.map((g) => g.code)).toEqual(['entree', 'main', 'dessert']); // catalog order, incl. empty extra
    expect(groups[1].dishes.map((d) => d.index)).toEqual([0, 2]); // flat indices preserved for in-place edits
    expect(groups[2].dishes).toHaveLength(0); // the empty extra section
  });
});
