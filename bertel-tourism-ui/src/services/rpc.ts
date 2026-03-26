import { filterMockCards, mockAuditQuestions, mockCrmTasks, mockObjectDetails, mockPendingChanges, mockPublicationCards, mockTimeline } from '../data/mock';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { AuditQuestion, ExplorerBucketKey, CrmTask, ExplorerFilters, ObjectCard, ObjectDetail, PendingChangeItem, PublicationCard, RpcPageResponse } from '../types/domain';
import { buildBucketRpcFilters, dedupeExplorerCards, getBackendTypesForBucket, getEffectiveSelectedBuckets, sortExplorerCards } from '../utils/facets';
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
  created_at: string;
  updated_at: string;
  lang?: string | null;
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

  const { data, error } = await client.schema('api').rpc('list_object_resources_filtered_page', {
    p_cursor: input.cursor ?? null,
    p_lang_prefs: input.langPrefs,
    p_page_size: pageSize,
    p_filters: buildBucketRpcFilters(input.filters, input.bucket),
    p_types: getBackendTypesForBucket(input.bucket),
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
    data: Array.isArray(payload.data) ? (payload.data as ObjectCard[]) : [],
  };
}

async function fetchAllExplorerBucketCards(bucket: ExplorerBucketKey, filters: ExplorerFilters, langPrefs: string[]): Promise<ObjectCard[]> {
  const cards: ObjectCard[] = [];
  let cursor: string | null = null;

  do {
    const page = await listExplorerPage({
      bucket,
      cursor,
      pageSize: 200,
      filters,
      langPrefs,
    });

    cards.push(...page.data);
    cursor = page.meta.next_cursor ?? null;
  } while (cursor);

  return cards;
}

export async function listExplorerCards(filters: ExplorerFilters, langPrefs: string[]): Promise<ObjectCard[]> {
  const buckets = getEffectiveSelectedBuckets(filters.selectedBuckets);
  const results = await Promise.all(buckets.map((bucket) => fetchAllExplorerBucketCards(bucket, filters, langPrefs)));
  return sortExplorerCards(dedupeExplorerCards(results.flat()));
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
}): Promise<CreatedObjectPrivateNote> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    const now = new Date().toISOString();
    return {
      id: `demo-private-note-${Date.now()}`,
      body: input.body,
      audience: 'private',
      created_at: now,
      updated_at: now,
      lang: session.langPrefs[0] ?? 'fr',
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Connexion backend indisponible pour enregistrer la note d'equipe.");
  }

  const { data, error } = await client
    .from('object_private_description')
    .insert({
      object_id: input.objectId,
      body: input.body,
      audience: 'private',
    })
    .select('id, body, audience, created_at, updated_at')
    .single();

  if (error) {
    throw error;
  }

  return data as CreatedObjectPrivateNote;
}

// TODO: wire to real backend RPC when available
export async function listPendingChanges(): Promise<PendingChangeItem[]> {
  if (useSessionStore.getState().demoMode) return mockPendingChanges;
  return [];
}

// TODO: wire to real backend RPC when available
export async function listCrmTasks(): Promise<CrmTask[]> {
  if (useSessionStore.getState().demoMode) return mockCrmTasks;
  return [];
}

// TODO: wire to real backend RPC when available
export async function listCrmTimeline(): Promise<typeof mockTimeline> {
  if (useSessionStore.getState().demoMode) return mockTimeline;
  return [];
}

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
