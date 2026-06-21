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
