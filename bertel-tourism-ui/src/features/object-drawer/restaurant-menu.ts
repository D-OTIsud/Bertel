/**
 * Projection d'AFFICHAGE de la carte/menu d'un restaurant pour le drawer public
 * (impl. 4.2). Pure. Lit les champs réels du payload (`menus` → `items` avec
 * `name`/`price`/`section`/`dietary_tags`, et `cuisine_types` top-level — mêmes
 * noms que l'RPC `get_object_resource`). Aucune donnée fabriquée : un plat sans
 * nom est ignoré.
 */
export interface MenuDish {
  key: string;
  name: string;
  price: string;
  dietary: string[];
}
export interface MenuSection {
  name: string;
  dishes: MenuDish[];
}
export interface RestaurantMenu {
  key: string;
  title: string;
  sections: MenuSection[];
}
export interface RestaurantMenuData {
  cuisines: string[];
  menus: RestaurantMenu[];
}

function str(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function readArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null) : [];
}

function readNames(value: unknown): string[] {
  return readArray(value).map((entry) => str(entry.name) || str(entry.label) || str(entry.code)).filter(Boolean);
}

function formatPrice(price: unknown, unit: string): string {
  const raw = str(price);
  if (!raw) return '';
  const isNumeric = /^\d+([.,]\d+)?$/.test(raw);
  const base = isNumeric ? `${raw} €` : raw;
  return unit ? `${base} / ${unit}` : base;
}

export function buildRestaurantMenuData(raw: Record<string, unknown>): RestaurantMenuData {
  const cuisines = readNames(raw.cuisine_types).length
    ? readNames(raw.cuisine_types)
    : readNames(raw.associated_restaurants_cuisine_types);

  const menus: RestaurantMenu[] = [];
  readArray(raw.menus).forEach((menu, menuIndex) => {
    const items = readArray(menu.items);
    // Groupe les plats par section (Entrée/Plat/Dessert…) en préservant l'ordre.
    const sectionOrder: string[] = [];
    const bySection = new Map<string, MenuDish[]>();
    items.forEach((item, itemIndex) => {
      const name = str(item.name);
      if (!name) return; // pas de plat fabriqué
      const sectionName = str((item.section as Record<string, unknown> | undefined)?.name) || 'Carte';
      const unit = str((item.unit as Record<string, unknown> | undefined)?.name);
      const dish: MenuDish = {
        key: str(item.id) || `${menuIndex}-${itemIndex}`,
        name,
        price: formatPrice(item.price, unit),
        dietary: readNames(item.dietary_tags),
      };
      if (!bySection.has(sectionName)) {
        bySection.set(sectionName, []);
        sectionOrder.push(sectionName);
      }
      bySection.get(sectionName)!.push(dish);
    });
    const sections: MenuSection[] = sectionOrder.map((name) => ({ name, dishes: bySection.get(name)! }));
    if (sections.length > 0) {
      menus.push({ key: str(menu.id) || `menu-${menuIndex}`, title: str(menu.name) || 'Carte', sections });
    }
  });

  return { cuisines, menus };
}
