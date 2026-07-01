// Service « Listes & templates d'envoi » — toutes les lectures/écritures passent par les RPC
// api.* DEFINER authorize-once (migration_object_list.sql, manifest L1). Les tables
// object_list / object_list_item ne sont PAS lisibles/écrivables en PostgREST direct
// (RLS + REVOKE anon/authenticated) : ne jamais ajouter de client.from('object_list') ici.
//
// Deux natures de liste :
//   * STATIQUE  — sélection Explorer figée (object_list_item : membres + ordre + notes).
//   * DYNAMIQUE — filtres Explorer sauvegardés (filters jsonb), ré-résolus live à chaque accès.
// La page publique (lien) et l'email consomment api.get_public_list_by_token (publié-only, sans PII).
import { getApiClient } from '../lib/supabase';
import type { ExplorerFilters } from '../types/domain';
import { buildBucketRpcFilters, getEffectiveBackendTypesForBucket, getEffectiveSelectedBuckets } from '../utils/facets';

type GenericRecord = Record<string, unknown>;

export type ListKind = 'static' | 'dynamic';
export type ListTemplate = 'carnet' | 'grille' | 'itineraire';
export type ListAccent = 'teal' | 'green' | 'gold' | 'terra';
export type ListStatus = 'draft' | 'sent' | 'shared';
export type ListChannel = 'email' | 'pdf' | 'web';

/** Payload RPC-ready d'une liste dynamique : les filtres Explorer, par bucket. */
export interface ListFilterBuckets {
  buckets: Array<{
    types?: string[];
    filters?: Record<string, unknown>;
    search?: string | null;
  }>;
}

/** Carte objet minimale telle que projetée par api.get_object_cards_batch dans chaque item. */
export interface ListItemCard {
  id: string;
  name: string;
  type: string;
  image: string | null;
  city: string | null;
  description: string | null;
  raw: GenericRecord;
}

export interface ObjectListItem {
  objectId: string;
  position: number;
  noteFr: string | null;
  noteEn: string | null;
  card: ListItemCard | null;
}

/** Résumé pour la grille « Mes listes ». */
export interface ObjectListCard {
  id: string;
  name: string;
  nameEn: string | null;
  kind: ListKind;
  status: ListStatus;
  lang: 'fr' | 'en';
  recipientLabel: string | null;
  coverUrl: string | null;
  updatedAt: string | null;
  itemCount: number;
  typeBreakdown: Array<{ code: string; n: number }>;
}

/** Détail complet d'une liste (vue composition). */
export interface ObjectListDetail {
  id: string;
  kind: ListKind;
  name: string;
  nameEn: string | null;
  recipientLabel: string | null;
  introFr: string | null;
  introEn: string | null;
  template: ListTemplate;
  accent: ListAccent;
  lang: 'fr' | 'en';
  coverUrl: string | null;
  showMap: boolean;
  status: ListStatus;
  filters: ListFilterBuckets | null;
  filtersUrl: string | null;
  shareToken: string | null;
  shareEnabled: boolean;
  shareExpiresAt: string | null;
  updatedAt: string | null;
  resolvedFrom: 'items' | 'filters';
  items: ObjectListItem[];
}

export interface ShareInfo {
  shareToken: string | null;
  shareUrlPath: string | null;
  shareEnabled: boolean;
  shareExpiresAt: string | null;
}

/** Vue publique d'une liste (lien partagé) — objets publiés uniquement, sans PII destinataire. */
export interface PublicList {
  name: string;
  nameEn: string | null;
  introFr: string | null;
  introEn: string | null;
  template: ListTemplate;
  accent: ListAccent;
  lang: 'fr' | 'en';
  coverUrl: string | null;
  showMap: boolean;
  items: ObjectListItem[];
}

/** Patch partiel des métadonnées éditables d'une liste. */
export interface ListPatch {
  name?: string;
  name_en?: string | null;
  recipient_label?: string | null;
  intro_fr?: string | null;
  intro_en?: string | null;
  template?: ListTemplate;
  accent?: ListAccent;
  lang?: 'fr' | 'en';
  cover_url?: string | null;
  show_map?: boolean;
  status?: ListStatus;
}

/** Item à persister via set_list_items (liste statique). */
export interface ListItemInput {
  object_id: string;
  position: number;
  note_fr?: string | null;
  note_en?: string | null;
}

// ---------- helpers de lecture ----------
function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
function readNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
function readBool(value: unknown): boolean {
  return value === true;
}
function asRecord(value: unknown): GenericRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as GenericRecord) : null;
}

function parseItemCard(value: unknown): ListItemCard | null {
  const card = asRecord(value);
  if (!card) return null;
  const location = asRecord(card.location);
  return {
    id: readString(card.id),
    name: readString(card.name),
    type: readString(card.type),
    image: readNullableString(card.image),
    city: location ? readNullableString(location.city) : null,
    description: readNullableString(card.description),
    raw: card,
  };
}

function parseItem(row: GenericRecord): ObjectListItem {
  return {
    objectId: readString(row.object_id),
    position: readNumber(row.position),
    noteFr: readNullableString(row.note_fr),
    noteEn: readNullableString(row.note_en),
    card: parseItemCard(row.card),
  };
}

export function parseListCard(row: GenericRecord): ObjectListCard {
  const breakdown = Array.isArray(row.type_breakdown) ? row.type_breakdown : [];
  return {
    id: readString(row.id),
    name: readString(row.name),
    nameEn: readNullableString(row.name_en),
    kind: (readString(row.kind, 'static') as ListKind),
    status: (readString(row.status, 'draft') as ListStatus),
    lang: (readString(row.lang, 'fr') as 'fr' | 'en'),
    recipientLabel: readNullableString(row.recipient_label),
    coverUrl: readNullableString(row.cover_url),
    updatedAt: readNullableString(row.updated_at),
    itemCount: readNumber(row.item_count),
    typeBreakdown: breakdown
      .map((b) => asRecord(b))
      .filter((b): b is GenericRecord => b !== null)
      .map((b) => ({ code: readString(b.code), n: readNumber(b.n) })),
  };
}

export function parseListDetail(row: GenericRecord): ObjectListDetail {
  const items = Array.isArray(row.items) ? row.items : [];
  const filters = asRecord(row.filters);
  return {
    id: readString(row.id),
    kind: (readString(row.kind, 'static') as ListKind),
    name: readString(row.name),
    nameEn: readNullableString(row.name_en),
    recipientLabel: readNullableString(row.recipient_label),
    introFr: readNullableString(row.intro_fr),
    introEn: readNullableString(row.intro_en),
    template: (readString(row.template, 'carnet') as ListTemplate),
    accent: (readString(row.accent, 'teal') as ListAccent),
    lang: (readString(row.lang, 'fr') as 'fr' | 'en'),
    coverUrl: readNullableString(row.cover_url),
    showMap: readBool(row.show_map),
    status: (readString(row.status, 'draft') as ListStatus),
    filters: filters ? (filters as unknown as ListFilterBuckets) : null,
    filtersUrl: readNullableString(row.filters_url),
    shareToken: readNullableString(row.share_token),
    shareEnabled: readBool(row.share_enabled),
    shareExpiresAt: readNullableString(row.share_expires_at),
    updatedAt: readNullableString(row.updated_at),
    resolvedFrom: (readString(row.resolved_from, 'items') as 'items' | 'filters'),
    items: items
      .map((it) => asRecord(it))
      .filter((it): it is GenericRecord => it !== null)
      .map(parseItem),
  };
}

function requireApiClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré.');
  }
  return client;
}

// ---------- lectures ----------
export async function listMyLists(): Promise<ObjectListCard[]> {
  const client = getApiClient();
  if (!client) return [];
  const { data, error } = await client.schema('api').rpc('list_my_lists');
  if (error) throw new Error(error.message || 'Chargement des listes impossible.');
  return Array.isArray(data) ? data.map((row) => parseListCard(row as GenericRecord)) : [];
}

export async function getList(listId: string): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('get_list', { p_list_id: listId });
  if (error) throw new Error(error.message || 'Liste introuvable.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

// ---------- créations ----------
/** Crée une liste STATIQUE à partir d'une sélection Explorer (ids d'objets figés). */
export async function createListFromSelection(name: string, objectIds: string[]): Promise<string> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('create_list', {
    p_kind: 'static',
    p_name: name,
    p_from_object_ids: objectIds,
    p_filters: null,
    p_filters_url: null,
  });
  if (error) throw new Error(error.message || 'Création de la liste impossible.');
  if (typeof data !== 'string') throw new Error('Réponse RPC sans id.');
  return data;
}

/**
 * Sérialise les filtres Explorer courants en payload de résolution (une entrée par bucket
 * sélectionné, dans la MÊME forme {types, filters, search} que le moteur DB api.get_filtered_object_ids
 * — cf. l'assemblage per-bucket de rpc.ts). Un bucket sans type effectif est ignoré.
 */
export function buildDynamicListFilters(filters: ExplorerFilters): ListFilterBuckets {
  const search = filters.common.search || null;
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets)
    .map((bucket) => {
      const types = getEffectiveBackendTypesForBucket(filters, bucket);
      if (types.length === 0) return null;
      return {
        types: types as unknown as string[],
        filters: buildBucketRpcFilters(filters, bucket) as Record<string, unknown>,
        search,
      };
    })
    .filter((b): b is NonNullable<typeof b> => b !== null);
  return { buckets };
}

/** Crée une liste DYNAMIQUE à partir des filtres Explorer courants (re-résolus à chaque accès). */
export async function createDynamicList(
  name: string,
  filters: ListFilterBuckets,
  filtersUrl: string | null,
): Promise<string> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('create_list', {
    p_kind: 'dynamic',
    p_name: name,
    p_from_object_ids: null,
    p_filters: filters,
    p_filters_url: filtersUrl,
  });
  if (error) throw new Error(error.message || 'Création de la liste dynamique impossible.');
  if (typeof data !== 'string') throw new Error('Réponse RPC sans id.');
  return data;
}

// ---------- mises à jour ----------
export async function updateList(listId: string, patch: ListPatch): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('update_list', { p_list_id: listId, p_patch: patch });
  if (error) throw new Error(error.message || 'Mise à jour impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

export async function setListItems(listId: string, items: ListItemInput[]): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('set_list_items', { p_list_id: listId, p_items: items });
  if (error) throw new Error(error.message || 'Enregistrement des lieux impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/**
 * Lecture PUBLIQUE par token (lien partagé) via api.get_public_list_by_token (anon).
 * Objets publiés uniquement, sans PII destinataire. Renvoie null si token invalide/expiré/désactivé.
 */
export async function getPublicList(token: string): Promise<PublicList | null> {
  const client = getApiClient();
  if (!client) return null;
  const { data, error } = await client.schema('api').rpc('get_public_list_by_token', { p_token: token });
  if (error) throw new Error(error.message || 'Liste indisponible.');
  const row = asRecord(data);
  if (!row) return null;
  const items = Array.isArray(row.items) ? row.items : [];
  return {
    name: readString(row.name),
    nameEn: readNullableString(row.name_en),
    introFr: readNullableString(row.intro_fr),
    introEn: readNullableString(row.intro_en),
    template: (readString(row.template, 'carnet') as ListTemplate),
    accent: (readString(row.accent, 'teal') as ListAccent),
    lang: (readString(row.lang, 'fr') as 'fr' | 'en'),
    coverUrl: readNullableString(row.cover_url),
    showMap: readBool(row.show_map),
    items: items
      .map((it) => asRecord(it))
      .filter((it): it is GenericRecord => it !== null)
      .map(parseItem),
  };
}

export async function deleteList(listId: string): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('delete_list', { p_list_id: listId });
  if (error) throw new Error(error.message || 'Suppression impossible.');
}

// ---------- envoi e-mail ----------
/**
 * Envoie la liste par e-mail via la route serveur POST /api/lists/send (relais SMTP côté VPS).
 * Passe le JWT de l'appelant en Bearer ; la route ré-autorise via get_list (en tant qu'appelant).
 */
export async function sendListByEmail(listId: string, toEmail: string): Promise<void> {
  const client = getApiClient();
  if (!client) throw new Error('Supabase non configuré.');
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Session expirée — reconnectez-vous.');
  const res = await fetch('/api/lists/send', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify({ listId, toEmail }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    if (res.status === 503) throw new Error("L'envoi d'e-mail n'est pas encore configuré (SMTP).");
    throw new Error(j.detail || j.error || "Échec de l'envoi.");
  }
}

// ---------- partage ----------
export async function shareList(
  listId: string,
  enable: boolean,
  expiresAt: string | null = null,
): Promise<ShareInfo> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('share_list', {
    p_list_id: listId,
    p_enable: enable,
    p_expires_at: expiresAt,
  });
  if (error) throw new Error(error.message || 'Partage impossible.');
  const row = asRecord(data) ?? {};
  return {
    shareToken: readNullableString(row.share_token),
    shareUrlPath: readNullableString(row.share_url_path),
    shareEnabled: readBool(row.share_enabled),
    shareExpiresAt: readNullableString(row.share_expires_at),
  };
}
