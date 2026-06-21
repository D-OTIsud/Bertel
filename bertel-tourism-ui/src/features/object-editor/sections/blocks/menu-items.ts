/**
 * §06 P2 — pure helpers for the structured carte editor (object_menu_item). The menus saver
 * (`saveObjectWorkspaceMenus`) already persists item name/price/kind/unit/description/dietary/
 * allergen; this module supplies the item factory + immutable list edits used by MenuItemsModal.
 * Cuisine-per-dish is intentionally NOT authored here — cuisine is a global object-level facet (§06 P1).
 */
import type { ObjectWorkspaceMenuItem } from '../../../../services/object-workspace-parser';

/** A fresh, empty dish row in a given section. `position` is 1-based; codes blank (saver tolerates empties). */
export function createMenuItem(index: number, sectionCode = '', sectionLabel = ''): ObjectWorkspaceMenuItem {
  return {
    recordId: null,
    name: '',
    description: '',
    price: '',
    currency: 'EUR',
    kindId: '',
    kindCode: '',
    kindLabel: '',
    unitId: '',
    unitCode: '',
    unitLabel: '',
    mediaIds: [],
    available: true,
    position: String(index + 1),
    dietaryTagCodes: [],
    allergenCodes: [],
    cuisineTypeCodes: [], // vestigial (cuisine is object-level since §06 P1); never authored here
    sectionCode,
    sectionId: '',
    sectionLabel,
  };
}

/** Immutable patch of one dish by index. */
export function updateMenuItem(
  items: ObjectWorkspaceMenuItem[],
  index: number,
  patch: Partial<ObjectWorkspaceMenuItem>,
): ObjectWorkspaceMenuItem[] {
  return items.map((item, i) => (i === index ? { ...item, ...patch } : item));
}

/** Immutable remove of one dish by index. */
export function removeMenuItem(items: ObjectWorkspaceMenuItem[], index: number): ObjectWorkspaceMenuItem[] {
  return items.filter((_, i) => i !== index);
}

/** Append a fresh dish, numbered after the current list. */
export function addMenuItem(items: ObjectWorkspaceMenuItem[]): ObjectWorkspaceMenuItem[] {
  return [...items, createMenuItem(items.length)];
}

/** Toggle a reference code (dietary tag / allergen) in/out of a dish's code list. */
export function toggleItemCode(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
}

/** Drop fully-blank dishes (no name AND no price) — keeps a save from persisting empty rows. */
export function pruneBlankItems(items: ObjectWorkspaceMenuItem[]): ObjectWorkspaceMenuItem[] {
  return items.filter((item) => item.name.trim() !== '' || item.price.trim() !== '');
}

/**
 * §06 P2b — group a menu's flat dish list into ordered SECTIONS (Entrée/Plat/Dessert…), preserving
 * each dish's flat index (needed for in-place edits). `extra` adds empty sections the user opened but
 * hasn't filled yet. Section order follows `sectionOrder` (the menu_category catalog order); unknown
 * sections fall to the end.
 */
export interface MenuSectionGroup {
  code: string;
  label: string;
  dishes: { item: ObjectWorkspaceMenuItem; index: number }[];
}

export function groupItemsBySection(
  items: ObjectWorkspaceMenuItem[],
  sectionOrder: { code: string; label: string }[],
  extra: { code: string; label: string }[] = [],
): MenuSectionGroup[] {
  const labelByCode = new Map(sectionOrder.map((s) => [s.code, s.label]));
  const rank = new Map(sectionOrder.map((s, i) => [s.code, i]));
  const byCode = new Map<string, MenuSectionGroup>();
  const ensure = (code: string, label: string) => {
    if (!byCode.has(code)) byCode.set(code, { code, label: labelByCode.get(code) ?? label, dishes: [] });
    return byCode.get(code)!;
  };
  for (const e of extra) ensure(e.code, e.label);
  items.forEach((item, index) => {
    ensure(item.sectionCode, item.sectionLabel).dishes.push({ item, index });
  });
  return Array.from(byCode.values()).sort(
    (a, b) => (rank.get(a.code) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.code) ?? Number.MAX_SAFE_INTEGER),
  );
}
