/**
 * §211 — partie PURE de l'administration des catalogues : traduction d'une colonne
 * PostgreSQL en contrôle, identité d'une ligne, libellé de secours.
 *
 * Aucune règle n'est écrite par catalogue : tout se déduit de ce que rend
 * api.get_ref_catalog. Les types non rendables (jsonb libre, tableaux, géométrie) sont
 * MASQUÉS — arbitrage PO du 2026-08-07 — d'où `computeAddBlocked`, qui désactive l'ajout
 * en NOMMANT la colonne fautive plutôt que de laisser buter sur une erreur PostgreSQL.
 */

export interface CatalogColumn {
  name: string;
  type: string;
  isRequired: boolean;
  hasDefault: boolean;
  enumValues: string[] | null;
}

export interface CatalogFk {
  column: string;
  target: string;
}

export type CatalogFieldKind =
  | 'text' | 'i18n-text' | 'boolean' | 'number' | 'date' | 'select' | 'reference';

export interface CatalogField {
  name: string;
  kind: CatalogFieldKind;
  options?: string[];
  target?: string;
  /** Saisissable à la création, figé ensuite (clé primaire naturelle, `code`). */
  locked: boolean;
}

export type CatalogFormMode = 'create' | 'edit';

/** Séparateur d'unité : ne peut pas apparaître dans une valeur de clé primaire. */
export const ROW_KEY_SEPARATOR = '';

const ALWAYS_HIDDEN = new Set(['created_at', 'updated_at']);
const NUMBER_TYPES = /^(smallint|integer|bigint|numeric|real|double precision)/;
const DATE_TYPES = /^(date|timestamp)/;
const TEXT_TYPES = /^(text|character varying|character|citext)/;

function isRenderable(column: CatalogColumn, fkColumns: Set<string>): boolean {
  // Un type tableau se teste AVANT tout le reste : `text[]` commence par `text` et passerait
  // sinon pour du texte libre, rendu en champ de saisie alors qu'il doit rester masqué.
  if (column.type.endsWith('[]')) return false;
  if (fkColumns.has(column.name)) return true;
  if (column.enumValues && column.enumValues.length > 0) return true;
  if (column.type === 'boolean') return true;
  if (NUMBER_TYPES.test(column.type)) return true;
  if (DATE_TYPES.test(column.type)) return true;
  return TEXT_TYPES.test(column.type);
}

export function buildCatalogFieldSpec(
  columns: CatalogColumn[],
  fks: CatalogFk[],
  primaryKeyColumns: string[],
  mode: CatalogFormMode,
): CatalogField[] {
  const fkByColumn = new Map(fks.map((fk) => [fk.column, fk.target]));
  const fkColumns = new Set(fkByColumn.keys());
  const pk = new Set(primaryKeyColumns);
  const names = new Set(columns.map((c) => c.name));
  const i18nSiblings = new Set(
    columns.filter((c) => c.name.endsWith('_i18n') && names.has(c.name.slice(0, -5))).map((c) => c.name),
  );

  const fields: CatalogField[] = [];
  for (const column of columns) {
    if (ALWAYS_HIDDEN.has(column.name)) continue;
    if (i18nSiblings.has(column.name)) continue;

    // Une clé primaire GÉNÉRÉE (uuid par défaut) n'a rien à saisir. Une clé primaire
    // SANS défaut — ref_commune.insee_code, les matrices — doit être saisie à la
    // création, sinon ces catalogues sont inéditables ; puis elle se fige.
    if (pk.has(column.name)) {
      if (column.hasDefault) continue;
      if (!isRenderable(column, fkColumns)) continue;
    } else if (!isRenderable(column, fkColumns)) {
      continue;
    }

    const locked = mode === 'edit' && (pk.has(column.name) || column.name === 'code');
    const target = fkByColumn.get(column.name);

    if (target) fields.push({ name: column.name, kind: 'reference', target, locked });
    else if (column.enumValues?.length)
      fields.push({ name: column.name, kind: 'select', options: column.enumValues, locked });
    else if (column.type === 'boolean') fields.push({ name: column.name, kind: 'boolean', locked });
    else if (NUMBER_TYPES.test(column.type)) fields.push({ name: column.name, kind: 'number', locked });
    else if (DATE_TYPES.test(column.type)) fields.push({ name: column.name, kind: 'date', locked });
    else
      fields.push({
        name: column.name,
        kind: names.has(`${column.name}_i18n`) ? 'i18n-text' : 'text',
        locked,
      });
  }
  return fields;
}

/**
 * Nom de la colonne qui empêche la création depuis l'interface, ou null.
 * Bloquante = obligatoire, sans valeur par défaut, et non rendue. AUCUNE exemption pour
 * les clés primaires : `hasDefault` protège déjà les UUID générés, et exempter les clés
 * rendrait `ref_commune` « créable » alors que l'insertion échouerait côté serveur.
 */
export function computeAddBlocked(
  columns: CatalogColumn[],
  fields: CatalogField[],
  _primaryKeyColumns: string[],
): string | null {
  const rendered = new Set(fields.map((f) => f.name));
  const blocking = columns.find(
    (c) => c.isRequired && !c.hasDefault && !ALWAYS_HIDDEN.has(c.name) && !rendered.has(c.name),
  );
  return blocking ? blocking.name : null;
}

/** L'identité d'une ligne, à passer telle quelle en `p_key`. */
export function buildRowKey(
  row: Record<string, unknown>,
  primaryKeyColumns: string[],
): Record<string, unknown> {
  const key: Record<string, unknown> = {};
  for (const name of primaryKeyColumns) key[name] = row[name];
  return key;
}

/**
 * Clé canonique d'une ligne — la MÊME que celle qui indexe `usage` côté serveur.
 * Volontairement pas du JSON : `jsonb::text` rend `{"id": "x"}` (avec espace) là où
 * `JSON.stringify` rend `{"id":"x"}`, et les deux ne se rejoindraient jamais.
 */
export function rowKeyString(row: Record<string, unknown>, primaryKeyColumns: string[]): string {
  return primaryKeyColumns.map((name) => String(row[name] ?? '')).join(ROW_KEY_SEPARATOR);
}

/**
 * Signal « valeur désactivée » (revue T9, constat 2) : `is_active` n'existe que sur une
 * minorité de catalogues (surtout les domaines ref_code) — le signal ne doit apparaître
 * QUE quand la colonne est réellement déclarée dans `columns`, jamais par la seule présence
 * d'une clé `is_active` sur la ligne (qui pourrait être une donnée fortuite non gérée ici).
 */
export function isRowInactive(row: Record<string, unknown>, columns: CatalogColumn[]): boolean {
  return columns.some((c) => c.name === 'is_active') && row.is_active === false;
}

/**
 * Libellé affichable. Les matrices n'ont aucune colonne de libellé (`labelColumn` vaut
 * null) : leur nom se compose depuis la clé primaire — c'est bien la seule information
 * qu'elles portent.
 */
export function formatRowLabel(
  row: Record<string, unknown>,
  labelColumn: string | null,
  primaryKeyColumns: string[],
): string {
  if (labelColumn) {
    const value = row[labelColumn];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number') return String(value);
  }
  return primaryKeyColumns.map((name) => String(row[name] ?? '')).join(' · ');
}
