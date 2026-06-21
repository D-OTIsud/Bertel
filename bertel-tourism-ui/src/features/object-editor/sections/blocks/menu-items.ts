/**
 * §06 P2 — pure helpers for the structured carte editor (object_menu_item). The menus saver
 * (`saveObjectWorkspaceMenus`) already persists item name/price/kind/unit/description/dietary/
 * allergen; this module supplies the item factory + immutable list edits used by MenuItemsModal.
 * Cuisine-per-dish is intentionally NOT authored here — cuisine is a global object-level facet (§06 P1).
 */
import type { ObjectWorkspaceMenuItem } from '../../../../services/object-workspace-parser';

/** A fresh, empty dish row. `position` is 1-based; codes blank (the saver tolerates empties). */
export function createMenuItem(index: number): ObjectWorkspaceMenuItem {
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
