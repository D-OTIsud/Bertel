import { filterMockCards, mockAuditQuestions, mockCrmTasks, mockMapObjects, mockObjectDetails, mockPendingChanges, mockPublicationCards, mockTimeline } from '../data/mock';
import { getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import type { AuditQuestion, CrmTask, ExplorerFilters, MapObject, ObjectCard, ObjectDetail, PendingChangeItem, PublicationCard, RpcPageResponse } from '../types/domain';
import { buildRpcFilters } from '../utils/facets';
import { normalizeObjectDetailPayload } from './object-detail';

interface ExplorerPageInput {
  cursor?: string | null;
  pageSize?: number;
  filters: ExplorerFilters;
  langPrefs: string[];
}

interface ExplorerRpcPayload {
  meta?: RpcPageResponse<ObjectCard>['meta'];
  data?: unknown;
}

interface MapObjectsRpcPayload {
  objects?: unknown;
}

interface ObjectResourceRpcPayload {
  id?: unknown;
  name?: unknown;
  type?: unknown;
  [key: string]: unknown;
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

  const client = getSupabaseClient();
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

function assertMapPayload(data: unknown): MapObjectsRpcPayload {
  if (!data || typeof data !== 'object') {
    throw new Error('Payload carte invalide recu depuis le RPC.');
  }
  return data as MapObjectsRpcPayload;
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
    return paginateMock(filterMockCards(input.filters), input.cursor, pageSize);
  }

  const { data, error } = await client.schema('api').rpc('list_object_resources_filtered_page', {
    p_cursor: input.cursor ?? null,
    p_lang_prefs: input.langPrefs,
    p_page_size: pageSize,
    p_filters: buildRpcFilters(input.filters),
    p_types: input.filters.selectedTypes.length > 0 ? input.filters.selectedTypes : null,
    p_search: input.filters.search || null,
    p_track_format: 'none',
    p_view: input.filters.view,
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

export async function listMapObjects(filters: ExplorerFilters, langPrefs: string[]): Promise<MapObject[]> {
  const session = useSessionStore.getState();
  const client = requireRpcClient();

  if (session.demoMode || !client) {
    return mockMapObjects.filter((item) =>
      filters.selectedTypes.length === 0 ? true : filters.selectedTypes.includes(item.type as never),
    );
  }

  const { data, error } = await client.schema('api').rpc('list_objects_map_view', {
    p_types: filters.selectedTypes.length > 0 ? filters.selectedTypes : null,
    p_status: ['published'],
    p_filters: buildRpcFilters(filters),
    p_lang_prefs: langPrefs,
    p_limit: 500,
    p_offset: 0,
  });

  if (error) {
    throw error;
  }

  const payload = assertMapPayload(data);
  return Array.isArray(payload.objects) ? (payload.objects as MapObject[]) : [];
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

export async function listPendingChanges(): Promise<PendingChangeItem[]> {
  if (!useSessionStore.getState().demoMode) {
    throw new Error('RPC pending_change a brancher sur le backend.');
  }
  return mockPendingChanges;
}

export async function listCrmTasks(): Promise<CrmTask[]> {
  if (!useSessionStore.getState().demoMode) {
    throw new Error('RPC CRM tasks a brancher sur le backend.');
  }
  return mockCrmTasks;
}

export async function listCrmTimeline(): Promise<typeof mockTimeline> {
  if (!useSessionStore.getState().demoMode) {
    throw new Error('RPC CRM timeline a brancher sur le backend.');
  }
  return mockTimeline;
}

export async function listAuditTemplate(): Promise<AuditQuestion[]> {
  if (!useSessionStore.getState().demoMode) {
    throw new Error('RPC audit_template a brancher sur le backend.');
  }
  return mockAuditQuestions;
}

export async function listPublicationBoard(): Promise<PublicationCard[]> {
  if (!useSessionStore.getState().demoMode) {
    throw new Error('RPC publication_object a brancher sur le backend.');
  }
  return mockPublicationCards;
}
