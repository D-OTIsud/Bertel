import { buildRestaurantMenuData } from './restaurant-menu';

function firstDish(raw: Record<string, unknown>) {
  return buildRestaurantMenuData(raw).menus[0].sections[0].dishes[0];
}

function menuWith(items: Record<string, unknown>[], extra: Record<string, unknown> = {}) {
  return { menus: [{ name: 'Carte', items, ...extra }] };
}

describe('buildRestaurantMenuData', () => {
  it('renvoie vide sans menu ni cuisine', () => {
    expect(buildRestaurantMenuData({})).toEqual({ cuisines: [], menus: [] });
  });

  it('extrait les types de cuisine, avec repli associated_restaurants_cuisine_types', () => {
    expect(buildRestaurantMenuData({ cuisine_types: [{ name: 'Créole' }] }).cuisines).toEqual(['Créole']);
    expect(buildRestaurantMenuData({ associated_restaurants_cuisine_types: [{ name: 'Métisse' }] }).cuisines).toEqual(['Métisse']);
  });

  it('formate un prix EUR', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: '6', currency: 'EUR' }])).formattedPrice;
    expect(price).toContain('6');
    expect(price).toContain('€');
  });

  it('formate un prix USD (jamais d’euro)', () => {
    const price = firstDish(menuWith([{ name: 'Burger', price: '10', currency: 'USD' }])).formattedPrice;
    expect(price).toContain('$');
    expect(price).not.toContain('€');
  });

  it('normalise une devise entourée d’espaces', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: '6', currency: ' eur ' }])).formattedPrice;
    expect(price).toContain('€');
  });

  it('replie sur « {montant} {DEVISE} » quand la devise est invalide', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: '6', currency: 'EU' }])).formattedPrice;
    expect(price).toBe('6 EU');
  });

  it('devise absente => EUR par défaut', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: '6' }])).formattedPrice;
    expect(price).toContain('€');
  });

  it('préserve un prix legacy déjà formaté (non numérique)', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: 'Prix du marché' }])).formattedPrice;
    expect(price).toBe('Prix du marché');
  });

  it('ajoute le suffixe d’unité', () => {
    const price = firstDish(menuWith([{ name: 'Cari', price: '6', currency: 'EUR', unit: { name: 'personne' } }])).formattedPrice;
    expect(price).toMatch(/\/ personne$/);
  });

  it('masque un plat indisponible', () => {
    const data = buildRestaurantMenuData(menuWith([
      { name: 'Dispo', price: '6' },
      { name: 'Épuisé', price: '9', is_available: false },
    ]));
    const names = data.menus[0].sections.flatMap((s) => s.dishes.map((d) => d.name));
    expect(names).toEqual(['Dispo']);
  });

  it('conserve un menu avec description mais sans plat visible', () => {
    const data = buildRestaurantMenuData({ menus: [{ name: 'Menu du soir', description: 'Servi de 19h à 22h', items: [] }] });
    expect(data.menus).toHaveLength(1);
    expect(data.menus[0].title).toBe('Menu du soir');
    expect(data.menus[0].description).toBe('Servi de 19h à 22h');
    expect(data.menus[0].sections).toEqual([]);
  });

  it('omet un menu sans plat ni description', () => {
    expect(buildRestaurantMenuData({ menus: [{ name: 'Vide', items: [] }] }).menus).toEqual([]);
  });

  it('ignore un menu privé', () => {
    const data = buildRestaurantMenuData({ menus: [{ name: 'Interne', description: 'x', visibility: 'private', items: [] }] });
    expect(data.menus).toEqual([]);
  });

  it('porte régimes et allergènes', () => {
    const dish = firstDish(menuWith([{
      name: 'Cari', price: '6',
      dietary_tags: [{ name: 'Végétarien' }],
      allergens: [{ name: 'Fruits à coque' }],
    }]));
    expect(dish.dietary).toEqual(['Végétarien']);
    expect(dish.allergens).toEqual(['Fruits à coque']);
  });

  it('préserve l’ordre des sections (ordre d’entrée) et regroupe sous « Carte » par défaut', () => {
    const data = buildRestaurantMenuData(menuWith([
      { name: 'Samoussas', price: '6', section: { name: 'Entrées' } },
      { name: 'Cari', price: '14', section: { name: 'Plats' } },
      { name: 'Sans section', price: '3' },
    ]));
    expect(data.menus[0].sections.map((s) => s.name)).toEqual(['Entrées', 'Plats', 'Carte']);
  });

  it('ignore un plat sans nom (pas de fabrication)', () => {
    expect(buildRestaurantMenuData(menuWith([{ price: '5' }])).menus).toEqual([]);
  });
});
