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
import { getServiceAvailability } from './service-availability';
import { mapDatabaseError, readApiErrorMessage } from './api-error';
import { readErrorMessage } from '../lib/db-error-message';
import type { ExplorerFilters, ObjectCard } from '../types/domain';
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
  /** Contacts PUBLICS de l'objet (api.list_item_contacts) : téléphone (repli mobile) + site web. */
  phone: string | null;
  web: string | null;
}

/**
 * Capacités et cycle de vie résolus SERVEUR (17m/226-listes) — identiques sur la carte de grille
 * et le détail. `canEdit` absent du payload RPC (ancien contrat, autre organisation…) DOIT valoir
 * FALSE : `readBool` ci-dessous rend `false` sur `undefined`, jamais un défaut permissif.
 */
export interface ListLifecycle {
  createdBy: string | null;
  creatorName: string | null;
  orgObjectId: string | null;
  lastActivityAt: string | null;
  isArchived: boolean;
  isFeatured: boolean;
  featureRequestedAt: string | null;
  /** Écriture (nom, items, notes, réglages…). Absent ⇒ FALSE — jamais un défaut permissif. */
  canEdit: boolean;
  /** Admin de l'organisation : mettre à la une / retirer sa PROPRE liste directement. */
  canManageFeature: boolean;
  /** Créateur non-admin : proposer sa liste personnelle à la une. */
  canProposeFeature: boolean;
  /** Propriétaire d'une personnelle archivée (ou reprise orpheline) : réactiver explicitement. */
  canRestore: boolean;
  /** Éditeur : modifier les réglages de partage (share_list). Un lecteur utilise ensure_list_share_link. */
  canManageSharing: boolean;
}

/** Résumé pour les grilles (Mes listes / À la une / Archives / Propositions). */
export interface ObjectListCard extends ListLifecycle {
  id: string;
  name: string;
  nameEn: string | null;
  kind: ListKind;
  status: ListStatus;
  /** État réel du lien, indépendant du dernier envoi et du statut éditorial. */
  hasActiveShareLink?: boolean;
  lang: 'fr' | 'en';
  accent: ListAccent;
  recipientLabel: string | null;
  coverUrl: string | null;
  updatedAt: string | null;
  itemCount: number;
  typeBreakdown: Array<{ code: string; n: number }>;
}

/** Détail complet d'une liste (vue composition). */
export interface ObjectListDetail extends ListLifecycle {
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
  /** Couverture EXPLICITE (éditable) — permet de revenir au mode automatique (null). */
  coverUrl: string | null;
  /** Couverture RENDUE : `coverUrl` si choisie, sinon le repli serveur (premier lieu illustré).
   *  Ne jamais persister ce repli automatiquement — seul `coverUrl` s'écrit. */
  effectiveCoverUrl: string | null;
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
  const contacts = asRecord(row.contacts);
  return {
    objectId: readString(row.object_id),
    position: readNumber(row.position),
    noteFr: readNullableString(row.note_fr),
    noteEn: readNullableString(row.note_en),
    card: parseItemCard(row.card),
    phone: contacts ? readNullableString(contacts.phone) : null,
    web: contacts ? readNullableString(contacts.web) : null,
  };
}

/** Lifecycle/capacités communs carte+détail — un champ absent (ancien payload) reste `false`/`null`. */
function parseLifecycle(row: GenericRecord): ListLifecycle {
  return {
    createdBy: readNullableString(row.created_by),
    creatorName: readNullableString(row.creator_name),
    orgObjectId: readNullableString(row.org_object_id),
    lastActivityAt: readNullableString(row.last_activity_at),
    isArchived: readBool(row.is_archived),
    isFeatured: readBool(row.is_featured),
    featureRequestedAt: readNullableString(row.feature_requested_at),
    canEdit: readBool(row.can_edit),
    canManageFeature: readBool(row.can_manage_feature),
    canProposeFeature: readBool(row.can_propose_feature),
    canRestore: readBool(row.can_restore),
    canManageSharing: readBool(row.can_manage_sharing),
  };
}

export function parseListCard(row: GenericRecord): ObjectListCard {
  const breakdown = Array.isArray(row.type_breakdown) ? row.type_breakdown : [];
  return {
    ...parseLifecycle(row),
    id: readString(row.id),
    name: readString(row.name),
    nameEn: readNullableString(row.name_en),
    kind: (readString(row.kind, 'static') as ListKind),
    status: (readString(row.status, 'draft') as ListStatus),
    hasActiveShareLink: typeof row.has_active_share_link === 'boolean'
      ? row.has_active_share_link
      : row.status === 'shared',
    lang: (readString(row.lang, 'fr') as 'fr' | 'en'),
    accent: (readString(row.accent, 'teal') as ListAccent),
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
  const coverUrl = readNullableString(row.cover_url);
  return {
    ...parseLifecycle(row),
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
    coverUrl,
    // Repli si le serveur omet encore `effective_cover_url` (ancien payload) : la couverture
    // explicite reste le meilleur repli connu — jamais un calcul client du "premier lieu illustré".
    effectiveCoverUrl: readNullableString(row.effective_cover_url) ?? coverUrl,
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

/**
 * Clés React Query PARTAGÉES entre `ListsManageView` et `ListComposeView` — une seule
 * définition garantit que les deux vues invalident/écrivent EXACTEMENT la même entrée de cache.
 * Les trois grilles ET le détail incluent `orgId` et `userId` : elles portent des capacités et
 * des listes PERSONNELLES propres à l'appelant, jamais seulement à son organisation. Sans
 * `userId`, deux membres de la même ORG partageraient la grille/les capacités du premier arrivé
 * dans le cache mémoire du même onglet ; `Providers.buster` ne gouverne que la réhydratation du
 * cache PERSISTÉ au chargement, pas les entrées déjà en mémoire pendant la session (§listes
 * 2026-09-07, revue architecte).
 */
export const listsQueryKeys = {
  myLists: (orgId: string | null, userId: string | null) => ['my-lists', orgId, userId] as const,
  featured: (orgId: string | null, userId: string | null) => ['featured-lists', orgId, userId] as const,
  proposals: (orgId: string | null, userId: string | null) => ['list-proposals', orgId, userId] as const,
  detail: (listId: string, userId: string | null, orgId: string | null) => ['list', listId, userId, orgId] as const,
};

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
  if (error) throw mapDatabaseError(error, 'Chargement des listes impossible.');
  return Array.isArray(data) ? data.map((row) => parseListCard(row as GenericRecord)) : [];
}

export async function getList(listId: string): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('get_list', { p_list_id: listId });
  if (error) throw mapDatabaseError(error, 'Liste introuvable.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/** Listes à la une de l'organisation active (api.list_featured_lists) — visibles à tous ses membres. */
export async function listFeaturedLists(): Promise<ObjectListCard[]> {
  const client = getApiClient();
  if (!client) return [];
  const { data, error } = await client.schema('api').rpc('list_featured_lists');
  if (error) throw mapDatabaseError(error, 'Chargement des listes à la une impossible.');
  return Array.isArray(data) ? data.map((row) => parseListCard(row as GenericRecord)) : [];
}

/**
 * Propositions en attente de l'organisation active (api.list_list_proposals) — réservé côté
 * serveur aux admins (rang >= 30 ou superuser) ; l'appelant ne doit l'invoquer QUE pour un admin
 * (cf. `isListsAdmin`), sans quoi le RPC renverra un ensemble vide ou une erreur d'autorisation.
 */
export async function listListProposals(): Promise<ObjectListCard[]> {
  const client = getApiClient();
  if (!client) return [];
  const { data, error } = await client.schema('api').rpc('list_list_proposals');
  if (error) throw mapDatabaseError(error, 'Chargement des propositions impossible.');
  return Array.isArray(data) ? data.map((row) => parseListCard(row as GenericRecord)) : [];
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
  if (error) throw mapDatabaseError(error, 'Création de la liste impossible.');
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

/**
 * Item de liste construit depuis une carte Explorer déjà chargée (palette d'ajout de la
 * composition) : l'objet ajouté est enrichi immédiatement (image, description, ville, coords
 * via raw.location) sans re-fetch. Les contacts publics (phone/web) ne sont PAS dans la carte
 * (api.list_item_contacts est service-role-only) : ils arrivent au round-trip set_list_items.
 */
export function listItemFromObjectCard(card: ObjectCard, position: number): ObjectListItem {
  return {
    objectId: card.id,
    position,
    noteFr: null,
    noteEn: null,
    card: {
      id: card.id,
      name: card.name,
      type: card.type,
      image: card.image ?? null,
      city: card.location?.city ?? null,
      description: card.description ?? null,
      raw: card as unknown as GenericRecord,
    },
    phone: null,
    web: null,
  };
}

/**
 * Adopte l'enrichissement serveur (carte + contacts) par objectId en préservant l'état local
 * d'édition : appartenance, ordre et notes restent ceux du client (une frappe ou un ajout en
 * vol pendant le round-trip n'est jamais écrasé — même classe de piège que §138 hydratedListId).
 */
export interface MergeEnrichedListItemsResult {
  items: ObjectListItem[];
  /** Ids ENVOYÉS au serveur mais absents du résultat — rejetés (ex. brouillon exclu côté SQL),
   *  jamais persistés, retirés de `items`. Distinct d'un ajout local survenu APRÈS l'envoi (lui
   *  aussi absent de `fresh`, mais absent aussi de `sent` — donc conservé). */
  rejectedIds: string[];
}

export function mergeEnrichedListItems(
  local: ObjectListItem[],
  fresh: ObjectListItem[],
  sent: ObjectListItem[],
): MergeEnrichedListItemsResult {
  const freshById = new Map(fresh.map((it) => [it.objectId, it]));
  const sentIds = new Set(sent.map((it) => it.objectId));
  const rejectedIds: string[] = [];
  const items = local.reduce<ObjectListItem[]>((acc, it) => {
    const enriched = freshById.get(it.objectId);
    if (enriched) {
      acc.push({ ...it, card: enriched.card, phone: enriched.phone, web: enriched.web });
    } else if (sentIds.has(it.objectId)) {
      rejectedIds.push(it.objectId);
    } else {
      acc.push(it);
    }
    return acc;
  }, []);
  return { items, rejectedIds };
}

/** Réordonnancement immuable d'un item (drag & drop de la composition). Indices hors bornes = no-op. */
export function moveListItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return [...items];
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
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
  if (error) throw mapDatabaseError(error, 'Création de la liste dynamique impossible.');
  if (typeof data !== 'string') throw new Error('Réponse RPC sans id.');
  return data;
}

// ---------- mises à jour ----------
export async function updateList(listId: string, patch: ListPatch): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('update_list', { p_list_id: listId, p_patch: patch });
  if (error) throw mapDatabaseError(error, 'Mise à jour impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

export async function setListItems(listId: string, items: ListItemInput[]): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('set_list_items', { p_list_id: listId, p_items: items });
  if (error) throw mapDatabaseError(error, 'Enregistrement des lieux impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

// ---------- cycle de vie / mise à la une ----------
/** Le créateur propose sa liste personnelle à la une de son organisation ; idempotent si déjà en attente. */
export async function requestListFeature(listId: string): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('request_list_feature', { p_list_id: listId });
  if (error) throw mapDatabaseError(error, 'Proposition à la une impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/**
 * Admin : accepte (met à la une) ou refuse une proposition de SON organisation. Le détail rendu
 * peut être `null` si l'appelant perd l'accès en lecture après un refus (normal — l'appelant
 * n'était lecteur que via la proposition) : l'écran doit alors revenir à la grille.
 */
export async function reviewListFeature(listId: string, accept: boolean): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client
    .schema('api')
    .rpc('review_list_feature', { p_list_id: listId, p_accept: accept });
  if (error) throw mapDatabaseError(error, 'Traitement de la proposition impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/**
 * Admin : met directement sa propre liste à la une, ou retire une liste à la une de son
 * organisation. Peut rendre `null` si l'appelant perd l'accès (retrait d'une liste dont il
 * n'était ni créateur ni membre lecteur au sens personnel).
 */
export async function setListFeatured(listId: string, featured: boolean): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client
    .schema('api')
    .rpc('set_list_featured', { p_list_id: listId, p_featured: featured });
  if (error) throw mapDatabaseError(error, 'Mise à la une impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/** Propriétaire d'une personnelle archivée (ou reprise orpheline) : réactivation explicite, idempotente sur une active. */
export async function restoreList(listId: string): Promise<ObjectListDetail | null> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('restore_list', { p_list_id: listId });
  if (error) throw mapDatabaseError(error, 'Restauration impossible.');
  const row = asRecord(data);
  return row ? parseListDetail(row) : null;
}

/**
 * Copie indépendante d'une liste utilisable (propriétaire, ou membre pour une liste à la une) :
 * nouveau propriétaire, jamais à la une/proposée, sans token ni destinataire hérités. Renvoie le
 * nouvel id (même contrat que `create_list`).
 */
export async function duplicateList(listId: string): Promise<string> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('duplicate_list', { p_list_id: listId });
  if (error) throw mapDatabaseError(error, 'Duplication impossible.');
  if (typeof data !== 'string') throw new Error('Réponse RPC sans id.');
  return data;
}

/**
 * Lecture PUBLIQUE par token (lien partagé) via api.get_public_list_by_token (anon).
 * Objets publiés uniquement, sans PII destinataire. Renvoie null si token invalide/expiré/désactivé.
 */
export async function getPublicList(token: string): Promise<PublicList | null> {
  const client = getApiClient();
  if (!client) return null;
  const { data, error } = await client.schema('api').rpc('get_public_list_by_token', { p_token: token });
  if (error) throw mapDatabaseError(error, 'Liste indisponible.');
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
  if (error) throw mapDatabaseError(error, 'Suppression impossible.');
}

// ---------- envoi e-mail ----------
/** Résultat d'un envoi accepté par le relais SMTP : `trackingUpdated` distingue l'e-mail
 * effectivement parti (toujours vrai ici) du marquage `sent` en base, qui peut échouer sans
 * jamais justifier un nouvel envoi (cf. ListComposeView.handleSend). */
export interface SendListEmailResult {
  trackingUpdated: boolean;
}

/**
 * Envoie la liste par e-mail via la route serveur POST /api/lists/send (relais SMTP côté VPS).
 * Passe le JWT de l'appelant en Bearer ; la route ré-autorise via get_list (en tant qu'appelant).
 */
export async function sendListByEmail(listId: string, toEmail: string): Promise<SendListEmailResult> {
  // A stale visible action must not start an SMTP request after an administrator disables it.
  const availability = await getServiceAvailability({ force: true });
  if (!availability.email) throw new Error("L'envoi d'e-mail n'est pas encore configuré (SMTP).");
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
    // La route relaie tel quel le message brut d'`ensure_list_share_link` (ex. « forbidden » +
    // detail:"SHARE_NOT_AVAILABLE: …") quand elle ne peut pas générer le lien « sélection
    // complète » qu'embarque l'e-mail : sans ce test, l'utilisateur lirait le libellé générique
    // « action non autorisée » au lieu de comprendre que le LIEN, pas ses droits, est en cause.
    const shareFriendly = j.detail ? shareLinkFriendlyMessage(j.detail) : null;
    if (shareFriendly) throw new Error(shareFriendly);
    throw new Error(readApiErrorMessage(j, res.status));
  }
  const body = (await res.json().catch(() => ({}))) as { trackingUpdated?: boolean };
  return { trackingUpdated: body.trackingUpdated === true };
}

// ---------- partage ----------
function parseShareInfo(row: GenericRecord): ShareInfo {
  return {
    shareToken: readNullableString(row.share_token),
    shareUrlPath: readNullableString(row.share_url_path),
    shareEnabled: readBool(row.share_enabled),
    shareExpiresAt: readNullableString(row.share_expires_at),
  };
}

/** Réservé à l'éditeur : active/désactive le lien ou change son expiration (api.share_list). */
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
  if (error) throw mapDatabaseError(error, 'Partage impossible.');
  return parseShareInfo(asRecord(data) ?? {});
}

/**
 * Codes métier de `ensure_list_share_link` traduits en FR (même pattern que `rbac.ts:FRIENDLY`).
 * Consommé à la fois par `ensureListShareLink` (message RPC direct) ET par `sendListByEmail`
 * (message relayé par la route `/api/lists/send`, qui appelle le MÊME RPC en tant qu'appelant) —
 * une seule table pour ne jamais laisser l'un des deux chemins afficher le code technique brut.
 */
const SHARE_LINK_FRIENDLY: Array<[string, string]> = [
  [
    'SHARE_NOT_AVAILABLE',
    'Ce lien a été désactivé ou a expiré — seul un éditeur peut le réactiver depuis les réglages de partage.',
  ],
];
function shareLinkFriendlyMessage(raw: string): string | null {
  for (const [code, friendly] of SHARE_LINK_FRIENDLY) {
    if (raw.includes(code)) return friendly;
  }
  return null;
}

/**
 * Tout utilisateur autorisé à UTILISER la liste (propriétaire, ou membre pour une liste à la
 * une) : génère le premier lien s'il n'en existe pas, ou réutilise le lien actif SANS toucher son
 * expiration. Un lecteur ne peut PAS réactiver un lien explicitement désactivé/expiré — l'éditeur
 * passe par `shareList` pour ça (api.ensure_list_share_link).
 */
export async function ensureListShareLink(listId: string): Promise<ShareInfo> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('ensure_list_share_link', { p_list_id: listId });
  if (error) {
    const friendly = shareLinkFriendlyMessage(readErrorMessage(error));
    if (friendly) throw new Error(friendly);
    throw mapDatabaseError(error, 'Partage indisponible.');
  }
  return parseShareInfo(asRecord(data) ?? {});
}
