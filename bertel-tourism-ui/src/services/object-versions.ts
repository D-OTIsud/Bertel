import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

/** One row from api.get_object_versions (snake_case → camelCase). */
export interface ObjectVersionRow {
  versionNumber: number;
  createdAt: string;
  createdByName: string;
  changeType: string;
  changeReason: string;
  changedFields: string[];
}

/** One canonical field that changed between two snapshots. */
export interface ObjectVersionDiffField {
  key: string;
  before: string;
  after: string;
}

/**
 * Cache/meta keys the diff ignores — the SAME ignore-list save_object_version() / get_object_versions
 * use, so a snapshot diff never surfaces noise rows. MUST stay byte-identical (same set) to the SQL
 * `ignore_keys` array in api.get_object_versions (migration_object_version_read_restore.sql /
 * api_views_functions.sql). Keep in lockstep.
 */
const DIFF_IGNORE_KEYS: ReadonlySet<string> = new Set([
  'updated_at', 'is_editing', 'commercial_visibility',
  'cached_min_price', 'cached_main_image_url', 'cached_rating', 'cached_review_count',
  'cached_is_open_now', 'cached_amenity_codes', 'cached_payment_codes', 'cached_environment_tags',
  'cached_language_codes', 'cached_classification_codes', 'cached_taxonomy_codes',
  'current_version', 'updated_by', 'created_at', 'created_by', 'id',
  'name_normalized', 'name_search_vector',
]);

function stringifyValue(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  return JSON.stringify(value);
}

/** Pure: the canonical fields that differ between two snapshots, cache/meta keys excluded. */
export function computeVersionDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): ObjectVersionDiffField[] {
  const keys = new Set<string>();
  for (const k of Object.keys(before ?? {})) keys.add(k);
  for (const k of Object.keys(after ?? {})) keys.add(k);

  const diff: ObjectVersionDiffField[] = [];
  for (const key of keys) {
    if (DIFF_IGNORE_KEYS.has(key)) {
      continue;
    }
    const beforeStr = stringifyValue(before?.[key]);
    const afterStr = stringifyValue(after?.[key]);
    if (beforeStr !== afterStr) {
      diff.push({ key, before: beforeStr, after: afterStr });
    }
  }
  return diff.sort((a, b) => a.key.localeCompare(b.key));
}

/** Pure: backend change_type → French label. */
export function formatChangeType(changeType: string): string {
  if (changeType === 'insert') return 'Création';
  if (changeType === 'update') return 'Modification';
  if (changeType === 'delete') return 'Suppression';
  return changeType;
}

function readRow(raw: unknown): Record<string, unknown> {
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
}

/** api.get_object_versions — timeline of canonical versions, newest first. */
export async function getObjectVersions(
  objectId: string,
  limit = 50,
  offset = 0,
): Promise<ObjectVersionRow[]> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return [];
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour l'historique des versions.");
  }
  const { data, error } = await apiClient.schema('api').rpc('get_object_versions', {
    p_object_id: objectId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error("Impossible de charger l'historique des versions.");
  }
  const rows = Array.isArray(data) ? data : [];
  return rows.map((raw) => {
    const row = readRow(raw);
    return {
      versionNumber: Number(row.version_number ?? 0),
      createdAt: String(row.created_at ?? ''),
      createdByName: String(row.created_by_name ?? ''),
      changeType: String(row.change_type ?? ''),
      changeReason: String(row.change_reason ?? ''),
      changedFields: Array.isArray(row.changed_fields) ? (row.changed_fields as string[]) : [],
    };
  });
}

/** api.get_object_version_snapshot — the full row jsonb of one version (null if absent). */
export async function getObjectVersionSnapshot(
  objectId: string,
  versionNumber: number,
): Promise<Record<string, unknown> | null> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour l'historique des versions.");
  }
  const { data, error } = await apiClient.schema('api').rpc('get_object_version_snapshot', {
    p_object_id: objectId,
    p_version_number: versionNumber,
  });
  if (error) {
    throw new Error("Impossible de charger cette version.");
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
}

/** api.rpc_restore_object_version — restores canonical fields and appends a new version. */
export async function restoreObjectVersion(objectId: string, versionNumber: number): Promise<void> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return;
  }
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error("Connexion backend indisponible pour restaurer cette version.");
  }
  const { error } = await apiClient.schema('api').rpc('rpc_restore_object_version', {
    p_object_id: objectId,
    p_version_number: versionNumber,
  });
  if (error) {
    throw new Error("Impossible de restaurer cette version.");
  }
}
