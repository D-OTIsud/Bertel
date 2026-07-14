/**
 * Projection d'AFFICHAGE de la carte/menu d'un restaurant pour le drawer public
 * (PLAN 3.3). Pure. Lit le payload `menus` (object_menu + items) et
 * `cuisine_types` top-level de get_object_resource. Formatage de prix conscient
 * de la devise (Intl.NumberFormat 'fr-FR', repli EUR), plats indisponibles
 * masqués, menus privés ignorés, ordre d'entrée préservé. Aucune donnée
 * fabriquée : un plat sans nom est ignoré ; un menu sans plat visible NI
 * description est omis.
 */
export interface MenuDish {
  key: string;
  name: string;
  description: string;
  formattedPrice: string;
  dietary: string[];
  allergens: string[];
  available: boolean;
}
export interface MenuSection {
  name: string;
  dishes: MenuDish[];
}
export interface RestaurantMenu {
  key: string;
  title: string;
  description: string;
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
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null)
    : [];
}

function readNames(value: unknown): string[] {
  return readArray(value).map((entry) => str(entry.name) || str(entry.label) || str(entry.code)).filter(Boolean);
}

/**
 * Formate un prix. Numérique => Intl.NumberFormat conscient de la devise
 * (repli EUR quand absente, `{montant} {DEVISE}` si la devise est invalide) ;
 * chaîne pré-formatée legacy préservée telle quelle. Suffixe ` / {unité}`.
 */
function formatPrice(price: unknown, currencyRaw: unknown, unit: string): string {
  const raw = str(price);
  if (!raw) return '';
  let base: string;
  const isNumeric = /^\d+([.,]\d+)?$/.test(raw);
  if (isNumeric) {
    const currency = str(currencyRaw).toUpperCase() || 'EUR';
    const amount = Number(raw.replace(',', '.'));
    try {
      base = new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(amount);
    } catch {
      base = `${raw} ${currency}`;
    }
  } else {
    base = raw; // legacy déjà formaté
  }
  return unit ? `${base} / ${unit}` : base;
}

export function buildRestaurantMenuData(raw: Record<string, unknown>): RestaurantMenuData {
  const cuisines = readNames(raw.cuisine_types).length
    ? readNames(raw.cuisine_types)
    : readNames(raw.associated_restaurants_cuisine_types);

  const menus: RestaurantMenu[] = [];
  readArray(raw.menus).forEach((menu, menuIndex) => {
    // Le RPC applique déjà l'accès en lecture ; défense contre une fuite de menu privé (PLAN 3.3.7).
    if (str(menu.visibility).toLowerCase() === 'private') return;

    const items = readArray(menu.items);
    const sectionOrder: string[] = [];
    const bySection = new Map<string, MenuDish[]>();
    items.forEach((item, itemIndex) => {
      const name = str(item.name);
      if (!name) return; // pas de plat fabriqué
      if (item.is_available === false) return; // plat indisponible masqué

      const unit = str((item.unit as Record<string, unknown> | undefined)?.name);
      const formattedPrice = formatPrice(item.price, item.currency, unit);
      const dish: MenuDish = {
        key: str(item.id) || `${menuIndex}-${itemIndex}`,
        name,
        description: str(item.description),
        formattedPrice,
        dietary: readNames(item.dietary_tags),
        allergens: readNames(item.allergens),
        available: true,
      };
      const sectionName = str((item.section as Record<string, unknown> | undefined)?.name) || 'Carte';
      if (!bySection.has(sectionName)) {
        bySection.set(sectionName, []);
        sectionOrder.push(sectionName);
      }
      bySection.get(sectionName)!.push(dish);
    });

    const sections: MenuSection[] = sectionOrder.map((name) => ({ name, dishes: bySection.get(name)! }));
    const description = str(menu.description);
    // Menu conservé s'il a des plats visibles OU une description ; omis s'il n'a ni l'un ni l'autre.
    if (sections.length > 0 || description) {
      menus.push({
        key: str(menu.id) || `menu-${menuIndex}`,
        title: str(menu.name) || 'Carte',
        description,
        sections,
      });
    }
  });

  return { cuisines, menus };
}
