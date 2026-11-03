import type { ObjectWorkspaceMenu, ObjectWorkspaceMenuItem, ObjectWorkspaceMenusModule, WorkspaceReferenceOption } from './object-workspace-parser';
import { isUuid, toNullableInteger, toNullableNumber } from './object-workspace-payloads/input';

type Row = Record<string, unknown>;
export const MENU_LINKS = ['media', 'dietary', 'allergens', 'cuisines'] as const;
export type MenuWriteSnapshot = { menus: Row[]; items: Row[] } & Record<typeof MENU_LINKS[number], Row[]>;
export interface MenuWriteBaseline { models: ObjectWorkspaceMenu[]; snapshot: MenuWriteSnapshot }
const text = (value: unknown) => value == null ? '' : String(value);
const nullable = (value: string) => value.trim() || null;
const idForCode = (options: WorkspaceReferenceOption[], code: string): string | null => {
  if (!code) return null;
  const option = options.find(item => item.code.toLowerCase() === code.toLowerCase());
  if (!option || !isUuid(option.id)) throw new Error(`Référence de menu inconnue : ${code}. Rechargez la fiche.`);
  return option.id;
};
const rowKey = (row: Row) => `${text(row.menu_item_id)}:${text(row.id ?? row.media_id ?? row.dietary_tag_id ?? row.allergen_id ?? row.cuisine_type_id)}`;
const ordered = (rows: Row[]) => [...rows].sort((a,b) => rowKey(a).localeCompare(rowKey(b)));
const same = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export function parseMenuWriteSnapshot(value: unknown): MenuWriteSnapshot {
  if (!value || typeof value !== 'object' || !['menus','items',...MENU_LINKS].every(key => Array.isArray((value as Row)[key])))
    throw new Error('Nous n’avons pas pu confirmer les menus enregistrés. Rechargez avant de réessayer.');
  return value as MenuWriteSnapshot;
}

function menuValues(menu: ObjectWorkspaceMenu, refs: ObjectWorkspaceMenusModule): Row {
  return { category_id: idForCode(refs.categoryOptions,menu.categoryCode), name: menu.name,
    description: nullable(menu.description), is_active: menu.active,
    visibility: nullable(menu.visibility) ?? (menu.rawVisibility === null ? null : 'public'), position: toNullableInteger(menu.position) };
}
function itemValues(item: ObjectWorkspaceMenuItem, refs: ObjectWorkspaceMenusModule): Row {
  return { name: item.name.trim() || 'Ligne', description: nullable(item.description), price: toNullableNumber(item.price),
    currency: nullable(item.currency) ?? 'EUR', kind_id: idForCode(refs.priceKindOptions,item.kindCode),
    unit_id: idForCode(refs.priceUnitOptions,item.unitCode), media_id: item.mediaIds[0] ?? null,
    is_available: item.available, position: toNullableInteger(item.position), section_id: idForCode(refs.categoryOptions,item.sectionCode) };
}
function linkValues(item: ObjectWorkspaceMenuItem, refs: ObjectWorkspaceMenusModule) {
  return {
    media: item.mediaIds.map((id,index) => { if (!isUuid(id)) throw new Error('Média de menu invalide.'); return { media_id:id,position:index+1 }; }),
    dietary: item.dietaryTagCodes.map(code => ({ dietary_tag_id:idForCode(refs.dietaryTagOptions,code) })),
    allergens: item.allergenCodes.map(code => ({ allergen_id:idForCode(refs.allergenOptions,code) })),
    cuisines: item.cuisineTypeCodes.map(code => ({ cuisine_type_id:idForCode(refs.cuisineTypeOptions,code) })),
  };
}
function changes(desired: Row, before?: Row) {
  return Object.fromEntries(Object.entries(desired).filter(([key,value]) => !before || !same(value,before[key])));
}
function itemBundle(snapshot: MenuWriteSnapshot,id: string) {
  return { row: snapshot.items.find(row => row.id === id) ?? null,
    ...Object.fromEntries(MENU_LINKS.map(key => [key,ordered(snapshot[key].filter(row => row.menu_item_id === id))])) };
}
function menuBundle(snapshot: MenuWriteSnapshot,id: string) {
  const items = snapshot.items.filter(row => row.menu_id === id);
  const ids = new Set(items.map(row => row.id));
  return { row: snapshot.menus.find(row => row.id === id) ?? null, items: ordered(items),
    ...Object.fromEntries(MENU_LINKS.map(key => [key,ordered(snapshot[key].filter(row => ids.has(row.menu_item_id)))])) };
}

/** A patch of editable fields, with explicit deletion sets from the known baseline only. */
export function buildMenusWritePayload(input: ObjectWorkspaceMenusModule) {
  const baseline = input.menuWriteBaseline;
  if (!baseline) throw new Error('Rechargez les menus avant d’enregistrer. Votre saisie est conservée.');
  const seen = new Set<string>();
  const stableId = (id: string | null) => {
    if (!id || !isUuid(id) || seen.has(id)) throw new Error('Identifiant de menu ou de plat manquant ou répété. Votre saisie est conservée.');
    seen.add(id); return id;
  };
  const menus: Row[] = []; const items: Row[] = [];
  const currentMenuIds = new Set(input.items.map(menu => menu.recordId));
  const currentItemIds = new Set(input.items.flatMap(menu => menu.items.map(item => item.recordId)));
  for (const menu of input.items) {
    const id = stableId(menu.recordId);
    const before = baseline.models.find(row => row.recordId === id);
    const patch = changes(menuValues(menu,input),before ? menuValues(before,input) : undefined);
    if (!before || Object.keys(patch).length) menus.push({ id,expected:baseline.snapshot.menus.find(row => row.id === id) ?? null,changes:patch });
    for (const item of menu.items) {
      const itemId=stableId(item.recordId);
      const previous = before?.items.find(row => row.recordId === itemId);
      const itemPatch = changes(itemValues(item,input),previous ? itemValues(previous,input) : undefined);
      const desiredLinks=linkValues(item,input); const beforeLinks=previous ? linkValues(previous,input) : undefined;
      const links=Object.fromEntries(MENU_LINKS.filter(key => !beforeLinks || !same(desiredLinks[key],beforeLinks[key])).map(key =>
        [key,{ expected:ordered(baseline.snapshot[key].filter(row => row.menu_item_id === itemId)),values:desiredLinks[key] }]));
      if (!previous || Object.keys(itemPatch).length || Object.keys(links).length)
        items.push({ id:itemId,menu_id:id,expected:baseline.snapshot.items.find(row => row.id === itemId) ?? null,changes:itemPatch,links });
    }
  }
  return { write_contract:'menus-reconcile-v1',menus,items,
    deleted_menus: baseline.models.filter(menu => menu.recordId && !currentMenuIds.has(menu.recordId))
      .map(menu => ({ id:menu.recordId,expected:menuBundle(baseline.snapshot,menu.recordId!) })),
    deleted_items: baseline.models.filter(menu => currentMenuIds.has(menu.recordId)).flatMap(menu => menu.items
      .filter(item => item.recordId && !currentItemIds.has(item.recordId))
      .map(item => ({ id:item.recordId,menu_id:menu.recordId,expected:itemBundle(baseline.snapshot,item.recordId!) }))),
  };
}

/** Rehydrate the confirmed snapshot; off-screen rows added by another writer are retained. */
export function withMenusWriteSnapshot(input: ObjectWorkspaceMenusModule,snapshot: MenuWriteSnapshot): ObjectWorkspaceMenusModule {
  const option=(options:WorkspaceReferenceOption[],id:unknown) => options.find(row => row.id === id);
  const rowsByPosition=(rows:Row[]) => [...rows].sort((a,b) => Number(a.position??0)-Number(b.position??0) || text(a.id).localeCompare(text(b.id)));
  const items=rowsByPosition(snapshot.menus).map((row,index):ObjectWorkspaceMenu => {
    const category=option(input.categoryOptions,row.category_id);
    return { recordId:text(row.id), categoryId:text(row.category_id),categoryCode:category?.code??'',categoryLabel:category?.label??'',
      name:text(row.name),rawName:row.name as string,description:text(row.description),active:row.is_active!==false,
      visibility:text(row.visibility)||'public',rawVisibility:row.visibility as string|null,position:text(row.position)||String(index+1),
      items:rowsByPosition(snapshot.items.filter(item => item.menu_id===row.id)).map((item,itemIndex):ObjectWorkspaceMenuItem => {
        const kind=option(input.priceKindOptions,item.kind_id),unit=option(input.priceUnitOptions,item.unit_id),section=option(input.categoryOptions,item.section_id);
        const codes=(key:typeof MENU_LINKS[number],column:string,refs:WorkspaceReferenceOption[]) => snapshot[key].filter(link => link.menu_item_id===item.id)
          .map(link => { const ref=option(refs,link[column]); if(!ref) throw new Error('Une référence de menu ne peut pas être relue. Rechargez la fiche.'); return ref.code; });
        return { recordId:text(item.id),name:text(item.name),description:text(item.description),price:text(item.price),currency:text(item.currency)||'EUR',
          kindId:text(item.kind_id),kindCode:kind?.code??'',kindLabel:kind?.label??'',unitId:text(item.unit_id),unitCode:unit?.code??'',unitLabel:unit?.label??'',
          mediaIds:[...new Set([text(item.media_id),...rowsByPosition(snapshot.media.filter(link => link.menu_item_id===item.id)).map(link => text(link.media_id))].filter(Boolean))],
          available:item.is_available!==false,position:text(item.position)||String(itemIndex+1),
          dietaryTagCodes:codes('dietary','dietary_tag_id',input.dietaryTagOptions),allergenCodes:codes('allergens','allergen_id',input.allergenOptions),
          cuisineTypeCodes:codes('cuisines','cuisine_type_id',input.cuisineTypeOptions),sectionCode:section?.code??'',sectionId:text(item.section_id),sectionLabel:section?.label??'' };
      }) };
  });
  return { ...input,items,menuWriteBaseline:{ models:JSON.parse(JSON.stringify(items)) as ObjectWorkspaceMenu[],snapshot } };
}
