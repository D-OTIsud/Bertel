import type { ObjectWorkspaceModules } from '../../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from '../editor-state';

/** Identity not carried inside `draft` (type/id live on the resource) — passed in. */
export interface ObjectIoMeta {
  objectId: string;
  type: string;
  name: string;
}

/** Versioned export wrapper. `format`/`version` let the importer assert the shape. */
export interface ObjectExportEnvelope {
  format: 'bertel-object';
  version: 2;
  objectId: string;
  type: string;
  exportedAt: string;
  modules: ObjectWorkspaceModules;
}

export type ImportParseResult =
  | { ok: true; modules: Partial<ObjectWorkspaceModules> }
  | { ok: false; error: string };

/** The set of editor module keys — derived from MODULE_KEY_MAP so it can never drift
 *  from the real ObjectWorkspaceModules shape (single source of truth). */
export const KNOWN_MODULE_KEYS: ReadonlySet<keyof ObjectWorkspaceModules> = new Set(
  Object.values(MODULE_KEY_MAP),
);

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/** Strip newlines, wrap in quotes, double embedded quotes (mirrors selection-export.ts). */
function csvEscape(value: unknown): string {
  const str = value == null ? '' : String(value);
  const normalized = str.replace(/\r?\n/g, ' ').trim();
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function serializeObjectJson(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string {
  const envelope: ObjectExportEnvelope = {
    format: 'bertel-object',
    version: 2,
    objectId: meta.objectId,
    type: meta.type,
    exportedAt: new Date().toISOString(),
    modules: draft,
  };
  return JSON.stringify(envelope, null, 2);
}

const CSV_HEADERS = ['id', 'name', 'type', 'status', 'address', 'postcode', 'city', 'phone', 'email'] as const;

/** First contact value whose kindCode matches (e.g. 'phone', 'email'); '' when absent. */
function firstContactValue(draft: ObjectWorkspaceModules, kindCode: string): string {
  const match = draft.contacts.objectItems.find((item) => item.kindCode === kindCode);
  return match ? match.value : '';
}

export function serializeObjectCsv(draft: ObjectWorkspaceModules, meta: ObjectIoMeta): string {
  const main = draft.location.main;
  const row = [
    meta.objectId,
    // §6 #5 — name is canonically generalInfo.name (the edited value); meta.name is a fallback.
    draft.generalInfo.name || meta.name,
    meta.type,
    draft.generalInfo.status,
    main.address1,
    main.postcode,
    main.city,
    firstContactValue(draft, 'phone'),
    firstContactValue(draft, 'email'),
  ].map(csvEscape).join(',');
  return [CSV_HEADERS.join(','), row].join('\n');
}

export function parseImportedObjectJson(raw: string): ImportParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Fichier JSON invalide : le contenu n’a pas pu être lu.' };
  }
  if (!isObject(parsed)) {
    return { ok: false, error: 'Fichier JSON invalide : un objet d’export était attendu.' };
  }
  const modulesRaw = (parsed as Record<string, unknown>).modules;
  if (!isObject(modulesRaw)) {
    return { ok: false, error: 'Fichier JSON invalide : aucun bloc « modules » exploitable.' };
  }

  const modules: Partial<ObjectWorkspaceModules> = {};
  for (const [key, value] of Object.entries(modulesRaw)) {
    if (!KNOWN_MODULE_KEYS.has(key as keyof ObjectWorkspaceModules)) {
      continue; // unknown key — never propagate into the draft
    }
    if (!isObject(value)) {
      continue; // a module must be an object; reject primitives/arrays
    }
    (modules as Record<string, unknown>)[key] = value;
  }

  if (Object.keys(modules).length === 0) {
    return { ok: false, error: 'Fichier JSON invalide : aucun module reconnu à importer.' };
  }
  return { ok: true, modules };
}

/** Catalog/option arrays are editor-load reference data (dropdown choices), NOT object
 *  data. They follow the `*Options` naming convention; taxonomy nests its catalog under
 *  `domains[].nodes` (the object's own choice lives in `domains[].assignment`). */

/** Pure catalog keys that don't follow the `*Options` convention (object data lives elsewhere). */
const EXTRA_CATALOG_KEYS = new Set<string>(['amenityGroups']);

function isCatalogKey(key: string): boolean {
  return key.endsWith('Options') || EXTRA_CATALOG_KEYS.has(key);
}

function stripModuleCatalogs(module: unknown): unknown {
  if (!isObject(module)) {
    return module;
  }
  const out: Record<string, unknown> = { ...module };
  for (const key of Object.keys(out)) {
    if (isCatalogKey(key) && Array.isArray(out[key])) {
      out[key] = [];
    }
  }
  if (Array.isArray(out.domains)) {
    out.domains = (out.domains as unknown[]).map((domain) =>
      isObject(domain) ? { ...domain, nodes: [] } : domain,
    );
  }
  return out;
}

/** Returns a copy of the editor modules with every reference catalog emptied. Used so the
 *  JSON export carries only the object's own data (no menu categories / allergens / etc.). */
export function stripCatalogOptions(modules: ObjectWorkspaceModules): ObjectWorkspaceModules {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(modules)) {
    out[key] = key === 'sustainability' ? stripSustainabilityCatalog(value) : stripModuleCatalogs(value);
  }
  return out as unknown as ObjectWorkspaceModules;
}

/** Inverse of stripCatalogOptions for the import path: file data wins, but an emptied
 *  catalog is refilled from the live draft so dropdowns stay populated. A v1 file (catalogs
 *  present) keeps its own. */
function restoreModuleCatalogs(incoming: unknown, draftModule: unknown): unknown {
  if (!isObject(incoming)) {
    return incoming;
  }
  const out: Record<string, unknown> = { ...incoming };
  const draft: Record<string, unknown> = isObject(draftModule) ? draftModule : {};

  for (const key of Object.keys(out)) {
    const importedEmpty = Array.isArray(out[key]) && (out[key] as unknown[]).length === 0;
    const draftHas = Array.isArray(draft[key]) && (draft[key] as unknown[]).length > 0;
    if (isCatalogKey(key) && importedEmpty && draftHas) {
      out[key] = draft[key];
    }
  }

  if (Array.isArray(out.domains) && Array.isArray(draft.domains)) {
    const draftDomains = draft.domains as unknown[];
    out.domains = (out.domains as unknown[]).map((domain) => {
      if (!isObject(domain) || (Array.isArray(domain.nodes) && domain.nodes.length > 0)) {
        return domain;
      }
      const match = draftDomains.find((candidate) => isObject(candidate) && candidate.domain === domain.domain);
      return isObject(match) && Array.isArray(match.nodes) ? { ...domain, nodes: match.nodes } : domain;
    });
  }
  return out;
}

/** A sustainability action carries data when selected, annotated, or document-linked. */
function actionHasData(action: unknown): boolean {
  return (
    isObject(action) &&
    (action.selected === true ||
      (typeof action.note === 'string' && action.note !== '') ||
      (typeof action.documentId === 'string' && action.documentId !== ''))
  );
}

/** Sustainability nests the V5 vocabulary as categories[].actions[] with the object's data
 *  (selected/note/documentId) on each action. Export keeps only actions carrying data and
 *  drops categories left empty. */
function stripSustainabilityCatalog(module: unknown): unknown {
  if (!isObject(module) || !Array.isArray(module.categories)) {
    return stripModuleCatalogs(module);
  }
  const base = stripModuleCatalogs(module) as Record<string, unknown>;
  base.categories = (module.categories as unknown[])
    .map((cat) =>
      isObject(cat) && Array.isArray(cat.actions)
        ? { ...cat, actions: (cat.actions as unknown[]).filter(actionHasData) }
        : cat,
    )
    .filter((cat) => !isObject(cat) || !Array.isArray(cat.actions) || (cat.actions as unknown[]).length > 0);
  return base;
}

/** Import: rebuild the full vocabulary from the live draft, overlaying the file's selection
 *  per (categoryCode, actionCode); actions absent from the file reset to unselected (file wins).
 *  If the draft carries no vocabulary, keep the file's selected-only set (data preserved). */
function restoreSustainabilityCatalog(incoming: unknown, draftModule: unknown): unknown {
  if (!isObject(incoming)) {
    return incoming;
  }
  const out = restoreModuleCatalogs(incoming, draftModule) as Record<string, unknown>;
  const draftCategories =
    isObject(draftModule) && Array.isArray(draftModule.categories) ? (draftModule.categories as unknown[]) : null;
  if (!draftCategories) {
    return out;
  }
  const fileByCategory = new Map<unknown, Map<unknown, Record<string, unknown>>>();
  for (const cat of Array.isArray(incoming.categories) ? (incoming.categories as unknown[]) : []) {
    if (!isObject(cat)) continue;
    const actions = new Map<unknown, Record<string, unknown>>();
    for (const action of Array.isArray(cat.actions) ? (cat.actions as unknown[]) : []) {
      if (isObject(action) && 'code' in action) actions.set(action.code, action);
    }
    fileByCategory.set(cat.code, actions);
  }
  out.categories = draftCategories.map((cat) => {
    if (!isObject(cat) || !Array.isArray(cat.actions)) return cat;
    const fileActions = fileByCategory.get(cat.code) ?? new Map<unknown, Record<string, unknown>>();
    return {
      ...cat,
      actions: (cat.actions as unknown[]).map((action) => {
        if (!isObject(action) || !('code' in action)) return action;
        const fileAction = fileActions.get(action.code);
        if (!fileAction) {
          return { ...action, selected: false, note: '', documentId: '' };
        }
        return {
          ...action,
          selected: fileAction.selected === true,
          note: typeof fileAction.note === 'string' ? fileAction.note : '',
          documentId: typeof fileAction.documentId === 'string' ? fileAction.documentId : '',
        };
      }),
    };
  });
  return out;
}

export function restoreCatalogOptions<T>(incoming: T, draftModule: unknown): T {
  if (isObject(incoming) && Array.isArray((incoming as Record<string, unknown>).categories)) {
    return restoreSustainabilityCatalog(incoming, draftModule) as T;
  }
  return restoreModuleCatalogs(incoming, draftModule) as T;
}
