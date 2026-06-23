import { buildRestaurantMenuData } from './restaurant-menu';

describe('buildRestaurantMenuData', () => {
  it('renvoie vide sans menu ni cuisine', () => {
    expect(buildRestaurantMenuData({})).toEqual({ cuisines: [], menus: [] });
  });

  it('extrait les types de cuisine (noms)', () => {
    const data = buildRestaurantMenuData({
      cuisine_types: [{ code: 'creole', name: 'Créole' }, { code: 'metisse', name: 'Métisse' }],
    });
    expect(data.cuisines).toEqual(['Créole', 'Métisse']);
  });

  it('regroupe les plats par section, formate le prix et porte les régimes', () => {
    const data = buildRestaurantMenuData({
      menus: [
        {
          name: 'Carte',
          items: [
            { name: 'Samoussas', price: '6', section: { name: 'Entrées', position: 1 }, dietary_tags: [{ name: 'Végétarien' }] },
            { name: 'Cari poulet', price: '14', section: { name: 'Plats', position: 2 }, dietary_tags: [] },
          ],
        },
      ],
    });
    expect(data.menus).toHaveLength(1);
    expect(data.menus[0].title).toBe('Carte');
    expect(data.menus[0].sections.map((s) => s.name)).toEqual(['Entrées', 'Plats']);
    const entree = data.menus[0].sections[0].dishes[0];
    expect(entree.name).toBe('Samoussas');
    expect(entree.price).toBe('6 €');
    expect(entree.dietary).toEqual(['Végétarien']);
  });

  it('ignore un plat sans nom (pas de fabrication)', () => {
    const data = buildRestaurantMenuData({ menus: [{ name: 'M', items: [{ price: '5' }] }] });
    expect(data.menus).toEqual([]);
  });

  it('groupe les plats sans section sous « Carte »', () => {
    const data = buildRestaurantMenuData({ menus: [{ items: [{ name: 'Plat du jour', price: '12' }] }] });
    expect(data.menus[0].sections[0].name).toBe('Carte');
    expect(data.menus[0].sections[0].dishes[0].name).toBe('Plat du jour');
  });
});
