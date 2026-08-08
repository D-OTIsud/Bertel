// §211 — service front de l'administration générée des catalogues de référence.
// Consomme les 5 RPC de migration_ref_catalog_admin.sql (api.list_ref_catalogs,
// api.get_ref_catalog, api.rpc_upsert_ref_row, api.rpc_delete_ref_row,
// api.rpc_reorder_ref_rows) — toutes SECURITY DEFINER, réservées super-admin.
// Gabarit : src/services/ref-codes.ts (requireClient(), .schema('api').rpc(...),
// erreur = Error(error.message)).

import { getSupabaseClient } from '../lib/supabase';
import type { CatalogColumn, CatalogFk } from '../features/settings/catalog-fields';

// `kind`/`access` sont contraints côté SQL (CHECK chk_ref_catalog_access ; `kind` ne peut
// valoir que 'table' ou 'ref_code_domain' — internal.v_ref_catalog, tâche 1) : unions
// littérales plutôt que `string`, pour que tsc refuse une troisième valeur au premier appelant.
export type RefCatalogKind = 'table' | 'ref_code_domain';
export type RefCatalogAccess = 'editable' | 'readonly';

export interface RefCatalogSummary {
  catalogKey: string;
  kind: RefCatalogKind;
  label: string;
  family: string;
  usedIn: string | null;
  access: RefCatalogAccess;
  readonlyReason: string | null;
  nValues: number;
}

export interface RefCatalogDetail {
  catalogKey: string;
  kind: RefCatalogKind;
  label: string;
  family: string;
  usedIn: string | null;
  access: RefCatalogAccess;
  readonlyReason: string | null;
  isIdentifiable: boolean;
  primaryKeyColumns: string[];
  /** Peut être null : cas des matrices, dont le libellé se compose depuis la clé côté front. */
  labelColumn: string | null;
  columns: CatalogColumn[];
  fks: CatalogFk[];
  rows: Record<string, unknown>[];
  usage: Record<string, number>;
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible.');
  }
  return client;
}

/** Maître : un catalogue par ligne (table ref_* ou domaine ref_code), toutes familles confondues. */
export async function listRefCatalogs(): Promise<RefCatalogSummary[]> {
  const { data, error } = await requireClient().schema('api').rpc('list_ref_catalogs');
  if (error) throw new Error(error.message);
  return ((data as Array<Record<string, unknown>>) ?? []).map((c) => ({
    catalogKey: String(c.catalog_key),
    kind: String(c.kind) as RefCatalogKind,
    label: String(c.label),
    family: String(c.family),
    usedIn: c.used_in == null ? null : String(c.used_in),
    access: String(c.access) as RefCatalogAccess,
    readonlyReason: c.readonly_reason == null ? null : String(c.readonly_reason),
    nValues: Number(c.n_values ?? 0),
  }));
}

/**
 * Garde de forme (constat 3, revue T7) : `get_ref_catalog` rend un objet JSON dont chaque
 * scalaire est ensuite passé à `String(...)`. Sans cette garde, une réponse malformée (clé
 * absente, RPC renommé côté serveur) produirait silencieusement la chaîne littérale
 * `"undefined"` propagée jusqu'à l'écran au lieu d'échouer bruyamment. On ne vérifie que les
 * champs scalaires TOUJOURS présents (jamais `null` côté SQL) — `used_in`/`readonly_reason`/
 * `label_column` sont nullables par contrat et donc exclus de cette liste.
 */
function assertRefCatalogDetailShape(
  d: Record<string, unknown>,
  catalogKey: string,
): void {
  const required = ['catalog_key', 'kind', 'label', 'family', 'access', 'is_identifiable'];
  const missing = required.filter((key) => d[key] === undefined);
  if (missing.length > 0) {
    throw new Error(
      `Réponse malformée de get_ref_catalog('${catalogKey}') : champ(s) manquant(s) ${missing.join(', ')}.`,
    );
  }
}

/** Détail : forme (colonnes, clé primaire, FK sortantes), lignes et carte d'usage. */
export async function getRefCatalog(catalogKey: string): Promise<RefCatalogDetail> {
  const { data, error } = await requireClient()
    .schema('api')
    .rpc('get_ref_catalog', { p_catalog_key: catalogKey });
  if (error) throw new Error(error.message);
  const d = (data as Record<string, unknown>) ?? {};
  assertRefCatalogDetailShape(d, catalogKey);

  // primary_key_columns est un tableau d'objets {name, type} : on extrait `name`, DANS
  // L'ORDRE — la clé canonique d'une ligne (jointure rows <-> usage, p_key des écritures)
  // en dépend.
  const primaryKeyColumns = ((d.primary_key_columns as Array<Record<string, unknown>>) ?? []).map(
    (k) => String(k.name),
  );

  // `position` (ordinal de colonne, tâche 1) n'est consommé par aucun appelant : les colonnes
  // sont déjà rendues triées par `attnum` côté SQL, l'ordre du tableau suffit. Ne pas le
  // reporter dans CatalogColumn — cf. constat 1, revue T7.
  const columns: CatalogColumn[] = ((d.columns as Array<Record<string, unknown>>) ?? []).map((c) => ({
    name: String(c.name),
    type: String(c.type),
    isRequired: Boolean(c.is_required),
    hasDefault: Boolean(c.has_default),
    enumValues:
      c.enum_values == null ? null : (c.enum_values as unknown[]).map((v) => String(v)),
  }));

  // outgoing_fk -> fks. Les `target` sont déjà des clés de catalogue exploitables
  // (ex. 'ref_code:amenity_family') : ne pas les retoucher.
  const fks = ((d.outgoing_fk as Array<Record<string, unknown>>) ?? []).map((f) => ({
    column: String(f.column),
    target: String(f.target),
  }));

  const usage = (d.usage as Record<string, unknown>) ?? {};

  return {
    catalogKey: String(d.catalog_key),
    kind: String(d.kind) as RefCatalogKind,
    label: String(d.label),
    family: String(d.family),
    usedIn: d.used_in == null ? null : String(d.used_in),
    access: String(d.access) as RefCatalogAccess,
    readonlyReason: d.readonly_reason == null ? null : String(d.readonly_reason),
    isIdentifiable: Boolean(d.is_identifiable),
    primaryKeyColumns,
    // label_column -> labelColumn : peut être null (matrices) — ne jamais substituer
    // une chaîne vide ni 'name'.
    labelColumn: d.label_column == null ? null : String(d.label_column),
    columns,
    fks,
    rows: (d.rows as Array<Record<string, unknown>>) ?? [],
    // usage reste tel quel : ses clés sont déjà la clé canonique attendue par le front.
    usage: Object.fromEntries(Object.entries(usage).map(([k, v]) => [k, Number(v)])),
  };
}

export async function upsertRefRow(
  catalogKey: string,
  rowKey: Record<string, unknown> | null,
  values: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_upsert_ref_row', {
    p_catalog_key: catalogKey,
    p_key: rowKey,
    p_values: values,
  });
  if (error) throw new Error(error.message);
}

export async function deleteRefRow(
  catalogKey: string,
  rowKey: Record<string, unknown>,
): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_delete_ref_row', {
    p_catalog_key: catalogKey,
    p_key: rowKey,
  });
  if (error) throw new Error(error.message);
}

export async function reorderRefRows(
  catalogKey: string,
  rowKeys: Record<string, unknown>[],
): Promise<void> {
  const { error } = await requireClient().schema('api').rpc('rpc_reorder_ref_rows', {
    p_catalog_key: catalogKey,
    p_keys: rowKeys,
  });
  if (error) throw new Error(error.message);
}

/** Familles alphabétiques, « À classer » toujours en dernier — un catalogue non classé
 *  doit se voir sans polluer le haut de la liste. */
export function groupByFamily(
  catalogs: RefCatalogSummary[],
): { family: string; catalogs: RefCatalogSummary[] }[] {
  const byFamily = new Map<string, RefCatalogSummary[]>();
  for (const catalog of catalogs) {
    const list = byFamily.get(catalog.family) ?? [];
    list.push(catalog);
    byFamily.set(catalog.family, list);
  }
  return [...byFamily.entries()]
    .map(([family, list]) => ({
      family,
      catalogs: [...list].sort((a, b) => a.label.localeCompare(b.label, 'fr')),
    }))
    .sort((a, b) => {
      if (a.family === 'À classer') return 1;
      if (b.family === 'À classer') return -1;
      return a.family.localeCompare(b.family, 'fr');
    });
}
