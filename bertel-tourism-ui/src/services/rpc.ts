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

interface ModifierDraftSaveInput {
  objectId: string;
  draft: {
    name: string;
    description: string;
    fields: Record<string, string>;
  };
}

export interface ModifierDraftSaveResult {
  saved: boolean;
  savedSections: string[];
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

function readStringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

function readUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isMissingRpc(error: unknown): boolean {
  return error instanceof Error && /function .* does not exist/i.test(error.message);
}

function splitSecondaryTypes(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function normalizeNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeNullableNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = Number.parseFloat(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
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
      include_private: true,
    },
  });

  if (error) {
    throw error;
  }

  const payload = assertObjectPayload(data);
  return normalizeObjectDetailPayload(payload, objectId);
}

async function tryGetObjectModifierPayloadRpc(
  objectId: string,
  langPrefs: string[],
  client: NonNullable<ReturnType<typeof getSupabaseClient>>,
): Promise<ObjectDetail> {
  const { data, error } = await client.schema('api').rpc('get_object_modifier_payload', {
    p_object_id: objectId,
    p_lang_prefs: langPrefs,
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

export async function getObjectModifierResource(objectId: string, langPrefs: string[]): Promise<ObjectDetail> {
  const session = useSessionStore.getState();
  const client = requireRpcClient();

  if (session.demoMode || !client) {
    return getObjectResource(objectId, langPrefs);
  }

  try {
    return await tryGetObjectModifierPayloadRpc(objectId, langPrefs, client);
  } catch (modifierError) {
    if (!isMissingRpc(modifierError)) {
      console.warn('Modifier payload RPC indisponible, fallback sur aggregation client.', modifierError);
    }
  }

  const detail = await getObjectResource(objectId, langPrefs);
  const actorIds = readUnknownArray((detail.raw ?? {}).actors)
    .map((actor: unknown) => readStringValue((actor as Record<string, unknown>)?.id))
    .filter(Boolean);

  const [
    objectRowResult,
    locationResult,
    zoneResult,
    placeResult,
    membershipResult,
    activityResult,
    interactionResult,
    taskResult,
    originResult,
    externalIdResult,
    legalResult,
    promotionResult,
    publicationResult,
    roomTypeResult,
    reviewResult,
    consentResult,
  ] = await Promise.allSettled([
    client
      .from('object')
      .select('business_timezone, secondary_types, current_version, cached_min_price, cached_rating, cached_review_count, cached_is_open_now, cached_language_codes, cached_classification_codes, cached_payment_codes')
      .eq('id', objectId)
      .maybeSingle(),
    client
      .from('object_location')
      .select('*')
      .eq('object_id', objectId)
      .order('is_main_location', { ascending: false })
      .order('position', { ascending: true }),
    client
      .from('object_zone')
      .select('*')
      .eq('object_id', objectId)
      .order('position', { ascending: true }),
    client
      .from('object_place')
      .select('*')
      .eq('object_id', objectId)
      .order('is_primary', { ascending: false })
      .order('position', { ascending: true }),
    client
      .from('object_membership')
      .select('*')
      .eq('object_id', objectId)
      .order('created_at', { ascending: false }),
    client
      .from('object_act')
      .select('*')
      .eq('object_id', objectId)
      .maybeSingle(),
    client
      .from('crm_interaction')
      .select('*')
      .eq('object_id', objectId)
      .order('occurred_at', { ascending: false }),
    client
      .from('crm_task')
      .select('*')
      .eq('object_id', objectId)
      .order('due_at', { ascending: true }),
    client
      .from('object_origin')
      .select('*')
      .eq('object_id', objectId),
    client
      .from('object_external_id')
      .select('*')
      .eq('object_id', objectId),
    client
      .from('object_legal')
      .select('*')
      .eq('object_id', objectId),
    client
      .from('promotion_object')
      .select('*')
      .eq('object_id', objectId),
    client
      .from('publication_object')
      .select('*')
      .eq('object_id', objectId),
    client.schema('api').rpc('get_object_room_types', {
      p_object_id: objectId,
      p_lang_prefs: langPrefs,
    }),
    client.schema('api').rpc('get_object_reviews', {
      p_object_id: objectId,
      p_limit: 20,
      p_offset: 0,
      p_lang_prefs: langPrefs,
    }),
    actorIds.length > 0
      ? client
        .from('actor_consent')
        .select('*, actor:actor_id(display_name)')
        .in('actor_id', actorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const objectRow = objectRowResult.status === 'fulfilled' ? objectRowResult.value.data : null;
  const objectLocations = locationResult.status === 'fulfilled' ? locationResult.value.data : null;
  const objectZones = zoneResult.status === 'fulfilled' ? zoneResult.value.data : null;
  const objectPlaces = placeResult.status === 'fulfilled' ? placeResult.value.data : null;
  const memberships = membershipResult.status === 'fulfilled' ? membershipResult.value.data : null;
  const objectAct = activityResult.status === 'fulfilled' ? activityResult.value.data : null;
  const interactions = interactionResult.status === 'fulfilled' ? interactionResult.value.data : null;
  const tasks = taskResult.status === 'fulfilled' ? taskResult.value.data : null;
  const origins = originResult.status === 'fulfilled' ? originResult.value.data : null;
  const externalIds = externalIdResult.status === 'fulfilled' ? externalIdResult.value.data : null;
  const legalRecords = legalResult.status === 'fulfilled' ? legalResult.value.data : null;
  const promotions = promotionResult.status === 'fulfilled' ? promotionResult.value.data : null;
  const publications = publicationResult.status === 'fulfilled' ? publicationResult.value.data : null;
  const roomTypes = roomTypeResult.status === 'fulfilled' && !roomTypeResult.value.error ? roomTypeResult.value.data : null;
  const reviewPayload = reviewResult.status === 'fulfilled' && !reviewResult.value.error && reviewResult.value.data && typeof reviewResult.value.data === 'object'
    ? reviewResult.value.data as Record<string, unknown>
    : null;
  const consents = consentResult.status === 'fulfilled' ? consentResult.value.data : null;

  const enrichedRaw: Record<string, unknown> = {
    ...(detail.raw ?? {}),
    business_timezone: objectRow?.business_timezone ?? (detail.raw ?? {}).business_timezone,
    secondary_types: objectRow?.secondary_types ?? (detail.raw ?? {}).secondary_types,
    current_version: objectRow?.current_version ?? (detail.raw ?? {}).current_version,
    cached_min_price: objectRow?.cached_min_price ?? (detail.raw ?? {}).cached_min_price,
    cached_rating: objectRow?.cached_rating ?? (detail.raw ?? {}).cached_rating,
    cached_review_count: objectRow?.cached_review_count ?? (detail.raw ?? {}).cached_review_count,
    cached_is_open_now: objectRow?.cached_is_open_now ?? (detail.raw ?? {}).cached_is_open_now,
    cached_language_codes: objectRow?.cached_language_codes ?? (detail.raw ?? {}).cached_language_codes,
    cached_classification_codes: objectRow?.cached_classification_codes ?? (detail.raw ?? {}).cached_classification_codes,
    cached_payment_codes: objectRow?.cached_payment_codes ?? (detail.raw ?? {}).cached_payment_codes,
    object_locations: objectLocations ?? (detail.raw ?? {}).object_locations,
    object_zones: objectZones ?? (detail.raw ?? {}).object_zones,
    object_places: objectPlaces ?? (detail.raw ?? {}).object_places,
    object_memberships: memberships ?? (detail.raw ?? {}).object_memberships,
    memberships: memberships ?? (detail.raw ?? {}).memberships,
    object_act: objectAct ?? (detail.raw ?? {}).object_act,
    activity: objectAct ?? (detail.raw ?? {}).activity,
    crm_interactions: interactions ?? (detail.raw ?? {}).crm_interactions,
    crm_tasks: tasks ?? (detail.raw ?? {}).crm_tasks,
    origins: origins ?? (detail.raw ?? {}).origins,
    external_ids: externalIds ?? (detail.raw ?? {}).external_ids,
    legal_records: legalRecords ?? (detail.raw ?? {}).legal_records,
    promotions: promotions ?? (detail.raw ?? {}).promotions,
    publications: publications ?? (detail.raw ?? {}).publications,
    object_room_types: roomTypes ?? (detail.raw ?? {}).object_room_types,
    room_types: roomTypes ?? (detail.raw ?? {}).room_types,
    review_summary: reviewPayload?.summary ?? (detail.raw ?? {}).review_summary,
    reviews: reviewPayload?.reviews ?? (detail.raw ?? {}).reviews,
    actor_consents: Array.isArray(consents)
      ? consents.map((item) => ({
        ...item,
        actor_name: readStringValue((item as Record<string, unknown>)?.actor && typeof (item as Record<string, unknown>).actor === 'object'
          ? ((item as Record<string, unknown>).actor as Record<string, unknown>).display_name
          : ''),
      }))
      : (detail.raw ?? {}).actor_consents,
  };

  return {
    ...detail,
    raw: enrichedRaw,
  };
}

export async function saveObjectModifierDraft(input: ModifierDraftSaveInput): Promise<ModifierDraftSaveResult> {
  const session = useSessionStore.getState();

  if (session.demoMode) {
    return {
      saved: true,
      savedSections: ['overview', 'location'],
    };
  }

  const client = getSupabaseClient();
  if (!client) {
    throw new Error('Connexion backend indisponible pour enregistrer les modifications.');
  }

  const objectPatch: Record<string, unknown> = {
    name: input.draft.name.trim() || 'Sans titre',
    commercial_visibility: normalizeNullableText(input.draft.fields['overview.commercialVisibility'] ?? ''),
  };

  const timezone = normalizeNullableText(input.draft.fields['overview.businessTimezone'] ?? '');
  if (timezone) {
    objectPatch.business_timezone = timezone;
  }

  objectPatch.secondary_types = splitSecondaryTypes(input.draft.fields['overview.secondaryTypes'] ?? '');

  const { error: objectError } = await client
    .from('object')
    .update(objectPatch)
    .eq('id', input.objectId);

  if (objectError) {
    throw objectError;
  }

  const descriptionPayload = {
    object_id: input.objectId,
    description: normalizeNullableText(input.draft.description),
    description_chapo: normalizeNullableText(input.draft.fields['overview.shortDescription'] ?? ''),
    description_adapted: normalizeNullableText(input.draft.fields['overview.adaptedDescription'] ?? ''),
    description_mobile: normalizeNullableText(input.draft.fields['overview.mobileDescription'] ?? ''),
    description_edition: normalizeNullableText(input.draft.fields['overview.editorialDescription'] ?? ''),
    sanitary_measures: normalizeNullableText(input.draft.fields['overview.sanitaryMeasures'] ?? ''),
  };

  const existingDescription = await client
    .from('object_description')
    .select('id')
    .eq('object_id', input.objectId)
    .is('org_object_id', null)
    .limit(1)
    .maybeSingle();

  if (existingDescription.error) {
    throw existingDescription.error;
  }

  if (existingDescription.data?.id) {
    const { error } = await client
      .from('object_description')
      .update(descriptionPayload)
      .eq('id', existingDescription.data.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client
      .from('object_description')
      .insert(descriptionPayload);

    if (error) {
      throw error;
    }
  }

  const locationPayload = {
    object_id: input.objectId,
    is_main_location: true,
    address1: normalizeNullableText(input.draft.fields['location.address1'] ?? ''),
    postcode: normalizeNullableText(input.draft.fields['location.postcode'] ?? ''),
    city: normalizeNullableText(input.draft.fields['location.city'] ?? ''),
    lieu_dit: normalizeNullableText(input.draft.fields['location.lieuDit'] ?? ''),
    direction: normalizeNullableText(input.draft.fields['location.direction'] ?? ''),
    latitude: normalizeNullableNumber(input.draft.fields['location.latitude'] ?? ''),
    longitude: normalizeNullableNumber(input.draft.fields['location.longitude'] ?? ''),
  };

  const existingLocation = await client
    .from('object_location')
    .select('id')
    .eq('object_id', input.objectId)
    .eq('is_main_location', true)
    .limit(1)
    .maybeSingle();

  if (existingLocation.error) {
    throw existingLocation.error;
  }

  if (existingLocation.data?.id) {
    const { error } = await client
      .from('object_location')
      .update(locationPayload)
      .eq('id', existingLocation.data.id);

    if (error) {
      throw error;
    }
  } else {
    const { error } = await client
      .from('object_location')
      .insert(locationPayload);

    if (error) {
      throw error;
    }
  }

  return {
    saved: true,
    savedSections: ['overview', 'location'],
  };
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
