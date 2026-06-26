import { filterMockCards, mockAuditQuestions, mockObjectDetails, mockPublicationCards } from '../data/mock';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { AuditQuestion, ExplorerBucketKey, ExplorerFilters, ObjectCard, ObjectDetail, PublicationCard, RpcPageResponse } from '../types/domain';
import { buildBucketRpcFilters, dedupeExplorerCards, getEffectiveBackendTypesForBucket, getEffectiveSelectedBuckets, sortExplorerCards } from '../utils/facets';
import { normalizeExplorerCards } from '../utils/explorer-card';
import { normalizeObjectDetailPayload } from './object-detail';

interface ExplorerPageInput {
  cursor?: string | null;
  pageSize?: number;
  bucket: ExplorerBucketKey;
  filters: ExplorerFilters;
  langPrefs: string[];
}

interface ExplorerRpcPayload {
  meta?: RpcPageResponse<ObjectCard>['meta'];
  data?: unknown;
}

interface ObjectResourceRpcPayload {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  [key: string]: unknown;
}

export interface CreatedObjectPrivateNote {
  id: string;
  body: string;
  audience: string;
  category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
  is_pinned: boolean;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
  lang?: string | null;
  created_by?: {
    id: string;
    display_name: string;
    avatar_url: string | null;
    email?: string | null;
  } | null;
}

export async function canWriteObjectPrivateNote(objectId: string): Promise<boolean> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return true;
  }

  const client = getApiClient();
  if (!client) {
    return false;
  }

  const { data, error } = await client.schema('api').rpc('can_write_object_private_notes', {
    p_object_id: objectId,
  });

  if (error) {
    throw error;
  }

  return data === true;
}

async function getCurrentUserOrgId(): Promise<string | null> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return 'ORG-DEMO';
  }

  const client = getApiClient();
  if (!client) {
    return null;
  }

  const { data, error } = await client.schema('api').rpc('current_user_org_id');

  if (error) {
    throw error;
  }

  return typeof data === 'string' && data.trim() ? data : null;
}

function paginateMock(cards: ObjectCard[], cursor: string | null | undefined, pageSize: number): RpcPageResponse<ObjectCard> {
  const offset = cursor ? Number.parseInt(cursor, 10) : 0;
  const slice = cards.slice(offset, offset + pageSize);
  const nextOffset = offset + pageSize < cards.length ? String(offset + pageSize) : null;

  return {
    meta: {
      kind: 'page',
      language: 'fr',
      language_fallbacks: ['fr', 'en'],
      page_size: pageSize,
      offset,
      total: cards.length,
      cursor: String(offset),
      next_cursor: nextOffset,
    },
    data: slice,
  };
}

function requireRpcClient() {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return null;
  }

  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configure. Activez explicitement le mode demo pour utiliser les donnees mock.');
  }

  return client;
}

function assertExplorerPayload(data: unknown): ExplorerRpcPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Payload explorer invalide recu depuis le RPC.');
  }
  return data as ExplorerRpcPayload;
}

function assertObjectPayload(data: unknown): ObjectResourceRpcPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Payload fiche invalide recu depuis le RPC.');
  }
  return data as ObjectResourceRpcPayload;
}

async function tryGetObjectWithDeepData(objectId: string, langPrefs: string[], client: NonNullable<ReturnType<typeof getSupabaseClient>>): Promise<ObjectDetail> {
  const { data, error } = await client.schema('api').rpc('get_object_with_deep_data', {
    p_object_id: objectId,
    p_languages: langPrefs,
    p_options: {
      render: true,
      include_private: true,
    },
  });

  if (error) {
    throw error;
  }

  return normalizeObjectDetailPayload(data, objectId);
}

export async function listExplorerPage(input: ExplorerPageInput): Promise<RpcPageResponse<ObjectCard>> {
  const session = useSessionStore.getState();
  const pageSize = input.pageSize ?? 20;
  const client = requireRpcClient();

  if (session.demoMode || !client) {
    return paginateMock(filterMockCards(input.filters, input.bucket), input.cursor, pageSize);
  }

  // The store carries the resolved statuses (cf. useExplorerCardsQuery →
  // resolveExplorerStatuses). When non-empty we hand them to the SQL function
  // as p_status so editors get drafts of their ORG; an empty array would let
  // the function fall back to its hard-coded ['published'] default, which is
  // never what we want here — the resolver already encodes the safe baseline.
  const statuses = input.filters.common.statuses;
  const pStatus = statuses.length > 0 ? statuses : null;

  const { data, error } = await client.schema('api').rpc('list_object_resources_filtered_page', {
    p_cursor: input.cursor ?? null,
    p_lang_prefs: input.langPrefs,
    p_page_size: pageSize,
    p_filters: buildBucketRpcFilters(input.filters, input.bucket),
    // Subtypes are pushed into p_types (server-side) instead of being filtered client-side,
    // so lazy server pagination returns exactly the rows the user asked for (§125).
    p_types: getEffectiveBackendTypesForBucket(input.filters, input.bucket),
    p_status: pStatus,
    p_search: input.filters.common.search || null,
    p_track_format: 'none',
    p_view: 'card',
  });

  if (error) {
    throw error;
  }

  const payload = assertExplorerPayload(data);
  if (!payload.meta) {
    throw new Error('Le RPC explorer n a pas renvoye de meta.');
  }

  return {
    meta: payload.meta,
    data: Array.isArray(payload.data) ? normalizeExplorerCards(payload.data as ObjectCard[]) : [],
  };
}

// Page size kept small on purpose: the server-side enrichment in
// api.get_object_cards_batch (taxonomy paths, badges, i18n) scales with the
// number of rows per call. Larger pages here trade per-call latency for
// Postgres' statement_timeout on the authenticated role.
const EXPLORER_BUCKET_PAGE_SIZE = 50;

// Buckets are paginated sequentially per bucket, but we run a small number of
// buckets in parallel. Fanning out all 7 buckets at once reliably saturates
// Postgres and surfaces as "canceling statement due to statement timeout".
const EXPLORER_BUCKET_CONCURRENCY = 2;

async function fetchAllExplorerBucketCards(bucket: ExplorerBucketKey, filters: ExplorerFilters, langPrefs: string[]): Promise<ObjectCard[]> {
  const cards: ObjectCard[] = [];
  let cursor: string | null = null;

  do {
    const page = await listExplorerPage({
      bucket,
      cursor,
      pageSize: EXPLORER_BUCKET_PAGE_SIZE,
      filters,
      langPrefs,
    });

    cards.push(...page.data);
    cursor = page.meta.next_cursor ?? null;
  } while (cursor);

  return cards;
}

async function mapWithConcurrency<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  async function run(): Promise<void> {
    while (true) {
      const index = next++;
      if (index >= items.length) {
        return;
      }
      results[index] = await worker(items[index]);
    }
  }

  const runners = Array.from({ length: Math.min(limit, items.length) }, run);
  await Promise.all(runners);
  return results;
}

export async function listExplorerCards(filters: ExplorerFilters, langPrefs: string[]): Promise<ObjectCard[]> {
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets);
  const results = await mapWithConcurrency(buckets, EXPLORER_BUCKET_CONCURRENCY, (bucket) =>
    fetchAllExplorerBucketCards(bucket, filters, langPrefs),
  );
  return sortExplorerCards(dedupeExplorerCards(results.flat()));
}

// ---------------------------------------------------------------------------
// Explorer map markers (§125) — the MAP's data source, decoupled from the card
// list. ONE cheap `api.list_object_markers` call per selected bucket (union +
// dedupe), returning thin ObjectCard-shaped rows ({id,type,name,image,open_now,
// location{lat,lon,city}}) for ALL matching geolocated objects. Replaces feeding
// the map the eager all-pages card fetch. No pagination — the marker payload is
// cheap enough to return the whole filtered set in one shot.
// ---------------------------------------------------------------------------
interface RawMarker {
  id?: unknown;
  type?: unknown;
  name?: unknown;
  image?: unknown;
  open_now?: unknown;
  location?: { lat?: unknown; lon?: unknown; city?: unknown } | null;
}

function normalizeMarkerCards(rows: unknown): ObjectCard[] {
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.flatMap((raw): ObjectCard[] => {
    const r = raw as RawMarker;
    const id = r?.id != null ? String(r.id) : '';
    if (!id) {
      return [];
    }
    const lat = r.location?.lat;
    const lon = r.location?.lon;
    return [
      {
        id,
        type: (r.type as ObjectCard['type']) ?? '',
        name: typeof r.name === 'string' ? r.name : '',
        image: r.image != null ? String(r.image) : null,
        open_now: typeof r.open_now === 'boolean' ? r.open_now : null,
        location: {
          lat: typeof lat === 'number' ? lat : lat != null ? Number(lat) : null,
          lon: typeof lon === 'number' ? lon : lon != null ? Number(lon) : null,
          city: r.location?.city != null ? String(r.location.city) : null,
        },
      },
    ];
  });
}

// No langPrefs: markers carry the canonical object name (no i18n pick) — keeping the
// signature lean. The map hover/popup uses the name as-is, same as the legacy card path.
export async function listObjectMarkers(filters: ExplorerFilters): Promise<ObjectCard[]> {
  const session = useSessionStore.getState();
  const client = requireRpcClient();
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets);

  if (session.demoMode || !client) {
    // Demo: the mock cards already carry coordinates — reuse the same per-bucket mock filter.
    const all = buckets.flatMap((bucket) => filterMockCards(filters, bucket));
    return dedupeExplorerCards(all).filter(
      (card) => typeof card.location?.lat === 'number' && typeof card.location?.lon === 'number',
    );
  }

  const statuses = filters.common.statuses;
  const pStatus = statuses.length > 0 ? statuses : null;

  const perBucket = await mapWithConcurrency(buckets, EXPLORER_BUCKET_CONCURRENCY, async (bucket) => {
    const types = getEffectiveBackendTypesForBucket(filters, bucket);
    if (types.length === 0) {
      return [] as ObjectCard[];
    }
    const { data, error } = await client.schema('api').rpc('list_object_markers', {
      p_types: types,
      p_status: pStatus,
      p_filters: buildBucketRpcFilters(filters, bucket),
      p_search: filters.common.search || null,
    });
    if (error) {
      throw error;
    }
    return normalizeMarkerCards(data);
  });

  return dedupeExplorerCards(perBucket.flat());
}

// ---------------------------------------------------------------------------
// Lazy cross-bucket card pagination (§125) — the LIST's data source. Each
// selected bucket keeps its own cursor in a composite pageParam so per-bucket
// filters (buildBucketRpcFilters is per-bucket) stay correctly scoped. A "page"
// advances every still-open bucket by one server page; getNextPageParam stops
// when all buckets are DONE. Replaces the eager do/while-all-pages fetch that
// tipped the 8s authenticated statement_timeout under contention.
// ---------------------------------------------------------------------------
export const EXPLORER_BUCKET_CURSOR_DONE = '__DONE__';
export type ExplorerBucketCursorMap = Partial<Record<ExplorerBucketKey, string | null>>;
export interface ExplorerCardsPage {
  cards: ObjectCard[];
  cursors: ExplorerBucketCursorMap;
}

export async function fetchExplorerCardsPage(
  filters: ExplorerFilters,
  langPrefs: string[],
  pageParam: ExplorerBucketCursorMap,
): Promise<ExplorerCardsPage> {
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets);
  const cursors: ExplorerBucketCursorMap = {};

  // Buckets that are exhausted, or carry no effective types (a stale/empty subtype
  // selection), contribute nothing and are marked DONE so pagination can terminate.
  const active = buckets.filter(
    (bucket) =>
      pageParam[bucket] !== EXPLORER_BUCKET_CURSOR_DONE &&
      getEffectiveBackendTypesForBucket(filters, bucket).length > 0,
  );
  for (const bucket of buckets) {
    if (!active.includes(bucket)) {
      cursors[bucket] = EXPLORER_BUCKET_CURSOR_DONE;
    }
  }

  const results = await mapWithConcurrency(active, EXPLORER_BUCKET_CONCURRENCY, async (bucket) => {
    const page = await listExplorerPage({
      bucket,
      cursor: pageParam[bucket] ?? null,
      pageSize: EXPLORER_BUCKET_PAGE_SIZE,
      filters,
      langPrefs,
    });
    return { bucket, page };
  });

  for (const { bucket, page } of results) {
    cursors[bucket] = page.meta.next_cursor ?? EXPLORER_BUCKET_CURSOR_DONE;
  }

  return { cards: results.flatMap((r) => r.page.data), cursors };
}

export function explorerCardsHasNextPage(
  filters: ExplorerFilters,
  cursors: ExplorerBucketCursorMap,
): boolean {
  return getEffectiveSelectedBuckets(filters.selectedBuckets).some(
    (bucket) =>
      cursors[bucket] !== EXPLORER_BUCKET_CURSOR_DONE &&
      getEffectiveBackendTypesForBucket(filters, bucket).length > 0,
  );
}

export async function getObjectResource(objectId: string, langPrefs: string[]): Promise<ObjectDetail> {
  const session = useSessionStore.getState();
  const client = requireRpcClient();

  if (session.demoMode || !client) {
    return mockObjectDetails[objectId] ?? {
      id: objectId,
      name: 'Fiche inconnue',
      raw: {},
    };
  }

  try {
    return await tryGetObjectWithDeepData(objectId, langPrefs, client);
  } catch (deepError) {
    console.warn('Deep data indisponible, fallback sur get_object_resource.', deepError);
  }

  const { data, error } = await client.schema('api').rpc('get_object_resource', {
    p_object_id: objectId,
    p_lang_prefs: langPrefs,
    p_track_format: 'geojson',
    p_options: {
      render: true,
      include_private: true,
    },
  });

  if (error) {
    throw error;
  }

  const payload = assertObjectPayload(data);
  return normalizeObjectDetailPayload(payload, objectId);
}

export async function createObjectPrivateNote(input: {
  objectId: string;
  body: string;
  category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
  isPinned: boolean;
}): Promise<CreatedObjectPrivateNote> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    const now = new Date().toISOString();
    return {
      id: `demo-private-note-${Date.now()}`,
      body: input.body,
      audience: 'private',
      category: input.category,
      is_pinned: input.isPinned,
      is_archived: false,
      created_at: now,
      updated_at: now,
      lang: session.langPrefs[0] ?? 'fr',
      created_by: {
        id: session.userId ?? 'demo-user',
        display_name: session.userName || 'Equipe demo',
        avatar_url: null,
        email: session.email || null,
      },
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Connexion backend indisponible pour enregistrer la note d'equipe.");
  }

  if (!session.userId) {
    throw new Error("Impossible d'identifier l'auteur de cette note.");
  }

  const orgId = await getCurrentUserOrgId();
  if (!orgId) {
    throw new Error("Un rattachement a une organisation active est requis pour ajouter une note interne.");
  }

  const { data, error } = await client
    .from('object_private_description')
    .insert({
      object_id: input.objectId,
      org_object_id: orgId,
      body: input.body,
      audience: 'private',
      category: input.category,
      is_pinned: input.isPinned,
      is_archived: false,
      created_by_user_id: session.userId,
    })
    .select('id, body, audience, category, is_pinned, is_archived, created_at, updated_at')
    .single();

  if (error) {
    if (error.message?.toLowerCase().includes('row-level security') || error.code === '42501') {
      throw new Error("Impossible d'enregistrer cette note pour le moment. Verifiez votre organisation active et vos droits d'acces a la fiche.");
    }
    throw error;
  }

  return {
    ...(data as Omit<CreatedObjectPrivateNote, 'created_by'>),
    created_by: {
      id: session.userId,
      display_name: session.userName || session.email || 'Equipe',
      avatar_url: null,
      email: session.email || null,
    },
  };
}

export async function updateObjectPrivateNote(input: {
  noteId: string;
  body: string;
  category: 'general' | 'important' | 'urgent' | 'internal' | 'followup';
  isPinned: boolean;
  isArchived: boolean;
}): Promise<Omit<CreatedObjectPrivateNote, 'created_by'>> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    const now = new Date().toISOString();
    return {
      id: input.noteId,
      body: input.body,
      audience: 'private',
      category: input.category,
      is_pinned: input.isPinned,
      is_archived: input.isArchived,
      created_at: now,
      updated_at: now,
      lang: session.langPrefs[0] ?? 'fr',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Connexion backend indisponible pour modifier la note d'equipe.");
  }

  const { data, error } = await client
    .from('object_private_description')
    .update({
      body: input.body,
      category: input.category,
      is_pinned: input.isPinned,
      is_archived: input.isArchived,
    })
    .eq('id', input.noteId)
    .select('id, body, audience, category, is_pinned, is_archived, created_at, updated_at')
    .single();

  if (error) {
    if (error.message?.toLowerCase().includes('row-level security') || error.code === '42501') {
      throw new Error("Impossible de modifier cette note pour le moment.");
    }
    throw error;
  }

  return data as Omit<CreatedObjectPrivateNote, 'created_by'>;
}

export async function deleteObjectPrivateNote(noteId: string): Promise<void> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Connexion backend indisponible pour supprimer la note d'equipe.");
  }

  const { error } = await client
    .from('object_private_description')
    .delete()
    .eq('id', noteId);

  if (error) {
    if (error.message?.toLowerCase().includes('row-level security') || error.code === '42501') {
      throw new Error("Impossible de supprimer cette note pour le moment.");
    }
    throw error;
  }
}

// Modération P2.1 (§120) : implémentations réelles dans services/moderation.ts (RPC-only —
// api.list/submit/approve/reject_pending_change ; la table pending_change est admin-only en RLS).
export { listPendingChanges, submitPendingChange, approvePendingChange, rejectPendingChange } from './moderation';

// CRM (§61) : implémentations réelles dans services/crm.ts (RPC-only — voir la spec).
export { listCrmTasks, listCrmTimeline } from './crm';

// TODO: wire to real backend RPC when available
export async function listAuditTemplate(): Promise<AuditQuestion[]> {
  if (useSessionStore.getState().demoMode) return mockAuditQuestions;
  return [];
}

// TODO: wire to real backend RPC when available
export async function listPublicationBoard(): Promise<PublicationCard[]> {
  if (useSessionStore.getState().demoMode) return mockPublicationCards;
  return [];
}

// --- Object creation (B1, decision log §105) ------------------------------------
// Réunion-only platform: new objects carry the 'RUN' region prefix in their generated
// id (e.g. HOTRUN…), matching every existing object, instead of the RPC's 'GEN' fallback.
export const DEFAULT_REGION_CODE = 'RUN';

function mapCreateObjectError(message: string): Error {
  if (/NO_AUTH_CONTEXT|not[ _-]*authenticat/i.test(message)) {
    return new Error('Session expirée — reconnectez-vous pour créer une fiche.');
  }
  if (/FORBIDDEN/i.test(message)) {
    return new Error(
      "Vous n'avez pas la permission de créer une fiche (un rattachement à une organisation active et la permission « create_object » sont requis).",
    );
  }
  if (/INVALID_OBJECT_TYPE/i.test(message)) {
    return new Error("Type de fiche invalide.");
  }
  if (/MISSING_REQUIRED_FIELD/i.test(message)) {
    return new Error('Le nom de la fiche est obligatoire.');
  }
  return new Error("Impossible de créer la fiche pour le moment.");
}

/**
 * Create a brand-new object via the live `api.rpc_create_object` RPC and return its
 * generated id. The RPC forces `status='draft'` + `created_by=auth.uid()` and auto-attaches
 * the creator's ORG as publisher (trigger), so the creator can immediately author the new
 * object in the full-page editor. This is the ONLY object-creation write path.
 */
export async function createObject(input: { type: string; name: string }): Promise<string> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return `DEMO-${input.type}-${Date.now()}`;
  }

  const client = getApiClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour créer la fiche.');
  }

  const { data, error } = await client.schema('api').rpc('rpc_create_object', {
    p_object_type: input.type,
    p_name: input.name,
    p_region_code: DEFAULT_REGION_CODE,
  });

  if (error) {
    throw mapCreateObjectError(error.message ?? '');
  }
  if (typeof data !== 'string' || data.length === 0) {
    throw new Error('La création a échoué (aucun identifiant renvoyé).');
  }
  return data;
}
