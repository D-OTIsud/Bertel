// Service CRM (§58) — toutes les lectures/écritures passent par les RPCs api.* DEFINER
// (spec docs/superpowers/specs/2026-06-11-crm-module-design.md). Les tables crm_* ne sont
// PAS lisibles en PostgREST direct : ne jamais ajouter de client.from('crm_...') ici.
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockCrmDirectory, mockCrmTasks, mockCrmTimeline } from '../data/mock';
import type { CrmInteraction, CrmTask, CrmTaskPriority, CrmTaskStatus, CrmTimelinePage } from '../types/domain';
// Type-only import (no cycle): object-workspace-parser does not import this module.
import type {
  ObjectWorkspaceCrmInteractionItem,
  ObjectWorkspaceCrmTopicCount,
} from './object-workspace-parser';

const TASK_STATUSES: CrmTaskStatus[] = ['todo', 'in_progress', 'done', 'canceled', 'blocked'];
const TASK_PRIORITIES: CrmTaskPriority[] = ['low', 'medium', 'high', 'urgent'];

type GenericRecord = Record<string, unknown>;

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function parseCrmTask(record: GenericRecord): CrmTask {
  const status = readString(record.status) as CrmTaskStatus;
  const priority = readString(record.priority) as CrmTaskPriority;
  return {
    id: readString(record.id),
    objectId: readString(record.object_id),
    objectName: readString(record.object_name),
    title: readString(record.title),
    description: readNullableString(record.description),
    status: TASK_STATUSES.includes(status) ? status : 'todo',
    priority: TASK_PRIORITIES.includes(priority) ? priority : 'medium',
    dueAt: readNullableString(record.due_at),
    ownerName: readNullableString(record.owner_name),
    relatedInteractionSubject: readNullableString(record.related_interaction_subject),
  };
}

export function parseCrmInteraction(record: GenericRecord): CrmInteraction {
  return {
    id: readString(record.id),
    // Contexte objet OPTIONNEL (§61) : une interaction peut être liée au seul acteur.
    objectId: readNullableString(record.object_id),
    objectName: readNullableString(record.object_name),
    interactionType: readString(record.interaction_type) || 'note',
    direction: readString(record.direction) || 'internal',
    status: readString(record.status) || 'done',
    subject: readString(record.subject),
    body: readNullableString(record.body),
    occurredAt: readNullableString(record.occurred_at),
    actorName: readNullableString(record.actor_name),
    topicCode: readNullableString(record.topic_code),
    topicName: readNullableString(record.topic_name),
    sentimentCode: readNullableString(record.sentiment_code),
    sentimentName: readNullableString(record.sentiment_name),
    ownerName: readNullableString(record.owner_name),
    source: readNullableString(record.source),
  };
}

export function parseCrmTimelinePage(payload: unknown): CrmTimelinePage {
  if (!payload || typeof payload !== 'object') {
    return { items: [], hasMore: false };
  }
  const record = payload as GenericRecord;
  const items = Array.isArray(record.items)
    ? record.items.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmInteraction)
    : [];
  return { items, hasMore: record.has_more === true };
}

function requireCrmClient() {
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

export interface CrmTimelineFilters {
  objectId?: string;
  topicCode?: string;
  interactionType?: string;
  sentimentCode?: string;
  before?: string;
  beforeId?: string;
  limit?: number;
}

export async function listCrmTimeline(filters: CrmTimelineFilters = {}): Promise<CrmTimelinePage> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmTimeline;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_timeline', {
    p_object_id: filters.objectId ?? null,
    p_topic_code: filters.topicCode ?? null,
    p_interaction_type: filters.interactionType ?? null,
    p_sentiment_code: filters.sentimentCode ?? null,
    p_before: filters.before ?? null,
    p_before_id: filters.beforeId ?? null,
    p_limit: filters.limit ?? 50,
  });
  if (error) {
    throw error;
  }
  return parseCrmTimelinePage(data);
}

export async function listCrmTasks(): Promise<CrmTask[]> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmTasks;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_tasks');
  if (error) {
    throw error;
  }
  return Array.isArray(data)
    ? data.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmTask)
    : [];
}

/* ===== Annuaire ACTEURS (§61 — modèle acteur-centré) ============================
   Acteur = la personne/organisation avec qui l'OTI interagit ; l'objet n'est que le
   CONTEXTE de la relation. Le même acteur peut être lié à plusieurs objets avec des
   rôles différents — l'annuaire et la fiche 360° suivent l'acteur à travers tous
   ses contextes (les deux sens de navigation sont portés par les vues /crm). */

/** Lien acteur → objet (contexte) dans l'annuaire (`api.list_crm_directory`). */
export interface CrmDirectoryObjectLink {
  objectId: string;
  objectName: string;
  objectType: string;
  roleName: string | null;
  isPrimary: boolean;
}

export interface CrmDirectoryEntry {
  actorId: string;
  displayName: string;
  objects: CrmDirectoryObjectLink[];
  objectCount: number;
  interactionCount: number;
  interactions12m: number;
  lastInteractionAt: string | null;
  lastInteractionType: string | null;
  lastInteractionSubject: string | null;
  lastInteractionObjectName: string | null;
  topTopics: string[];
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseDirectoryObjectLink(record: GenericRecord): CrmDirectoryObjectLink {
  return {
    objectId: readString(record.object_id),
    objectName: readString(record.object_name),
    objectType: readString(record.object_type),
    roleName: readNullableString(record.role_name),
    isPrimary: record.is_primary === true,
  };
}

export function parseCrmDirectoryEntry(record: GenericRecord): CrmDirectoryEntry {
  return {
    actorId: readString(record.actor_id),
    displayName: readString(record.display_name),
    objects: Array.isArray(record.objects)
      ? record.objects.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseDirectoryObjectLink)
      : [],
    objectCount: readNumber(record.object_count),
    interactionCount: readNumber(record.interaction_count),
    interactions12m: readNumber(record.interactions_12m),
    lastInteractionAt: readNullableString(record.last_interaction_at),
    lastInteractionType: readNullableString(record.last_interaction_type),
    lastInteractionSubject: readNullableString(record.last_interaction_subject),
    lastInteractionObjectName: readNullableString(record.last_interaction_object_name),
    topTopics: Array.isArray(record.top_topics)
      ? record.top_topics.filter((topic): topic is string => typeof topic === 'string')
      : [],
  };
}

/** RPC `api.list_crm_directory` — l'annuaire acteurs complet (696 lignes live). */
export async function listCrmDirectory(): Promise<CrmDirectoryEntry[]> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmDirectory;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_directory');
  if (error) {
    throw error;
  }
  return Array.isArray(data)
    ? data.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmDirectoryEntry)
    : [];
}

/* ===== Fiche acteur 360° (§61 — api.list_actor_crm) ============================ */

/** Lien objet de la fiche acteur — comme l'annuaire + role_code. */
export interface ActorCrmObjectLink extends CrmDirectoryObjectLink {
  roleCode: string | null;
}

export interface ActorCrmSnapshot {
  actor: { id: string; displayName: string; firstName: string | null; lastName: string | null };
  objects: ActorCrmObjectLink[];
  /** Interactions de l'acteur, tous contextes — objectId/objectName null = « Général ». */
  interactions: CrmInteraction[];
  topics: Array<{ code: string; name: string; count: number }>;
}

const EMPTY_ACTOR_SNAPSHOT: ActorCrmSnapshot = {
  actor: { id: '', displayName: '', firstName: null, lastName: null },
  objects: [],
  interactions: [],
  topics: [],
};

function parseTopicCounts(value: unknown): Array<{ code: string; name: string; count: number }> {
  return Array.isArray(value)
    ? value
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map((row) => ({ code: readString(row.code), name: readString(row.name), count: readNumber(row.count) }))
    : [];
}

export function parseActorCrmSnapshot(payload: unknown): ActorCrmSnapshot {
  if (!payload || typeof payload !== 'object') {
    return { ...EMPTY_ACTOR_SNAPSHOT };
  }
  const record = payload as GenericRecord;
  const actorRecord = (record.actor && typeof record.actor === 'object' ? record.actor : {}) as GenericRecord;
  return {
    actor: {
      id: readString(actorRecord.id),
      displayName: readString(actorRecord.display_name),
      firstName: readNullableString(actorRecord.first_name),
      lastName: readNullableString(actorRecord.last_name),
    },
    objects: Array.isArray(record.objects)
      ? record.objects
          .filter((row): row is GenericRecord => !!row && typeof row === 'object')
          .map((row) => ({ ...parseDirectoryObjectLink(row), roleCode: readNullableString(row.role_code) }))
      : [],
    interactions: Array.isArray(record.interactions)
      ? record.interactions.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmInteraction)
      : [],
    topics: parseTopicCounts(record.topics),
  };
}

// Fiche démo dérivée de l'annuaire mock + des items timeline mock liés aux objets de
// l'acteur — pas de fabrication au-delà des fixtures existantes.
function demoActorCrm(actorId: string): ActorCrmSnapshot {
  const entry = mockCrmDirectory.find((candidate) => candidate.actorId === actorId);
  if (!entry) {
    return { ...EMPTY_ACTOR_SNAPSHOT, actor: { ...EMPTY_ACTOR_SNAPSHOT.actor, id: actorId } };
  }
  const objectIds = new Set(entry.objects.map((object) => object.objectId));
  const interactions = mockCrmTimeline.items.filter((item) => item.objectId !== null && objectIds.has(item.objectId));
  const topicCounts = new Map<string, { code: string; name: string; count: number }>();
  for (const item of interactions) {
    if (!item.topicCode) continue;
    const existing = topicCounts.get(item.topicCode);
    if (existing) existing.count += 1;
    else topicCounts.set(item.topicCode, { code: item.topicCode, name: item.topicName ?? item.topicCode, count: 1 });
  }
  return {
    actor: { id: entry.actorId, displayName: entry.displayName, firstName: null, lastName: null },
    objects: entry.objects.map((object) => ({ ...object, roleCode: null })),
    interactions,
    topics: [...topicCounts.values()],
  };
}

/**
 * RPC `api.list_actor_crm` + parse. Throws l'erreur PostgREST BRUTE (`.code` doit
 * survivre : 42501 = acteur hors périmètre de l'ORG du lecteur).
 */
export async function listActorCrm(actorId: string): Promise<ActorCrmSnapshot> {
  const client = requireCrmClient();
  if (!client) {
    return demoActorCrm(actorId);
  }
  const { data, error } = await client.schema('api').rpc('list_actor_crm', { p_actor_id: actorId });
  if (error) {
    throw error;
  }
  return parseActorCrmSnapshot(data);
}

export interface SaveCrmTaskInput {
  id?: string;
  objectId?: string;
  title?: string;
  description?: string | null;
  status?: CrmTaskStatus;
  priority?: CrmTaskPriority;
  dueAt?: string | null;
}

export async function saveCrmTask(input: SaveCrmTaskInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    // Mode démo : reflète le move dans le mock pour éviter un contrôle sans effet.
    if (input.id) {
      const task = mockCrmTasks.find((t) => t.id === input.id);
      if (task && input.status) task.status = input.status;
    }
    return input.id ?? 'demo-task';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueAt !== undefined) payload.due_at = input.dueAt;
  const { data, error } = await client.schema('api').rpc('save_crm_task', { p_payload: payload });
  if (error) {
    throw error;
  }
  const id = readString((data as GenericRecord | null)?.id);
  if (!id) {
    throw new Error('Réponse RPC sans id');
  }
  return id;
}

export interface SaveCrmInteractionInput {
  id?: string;
  objectId?: string;
  interactionType?: string;
  direction?: string;
  status?: string;
  subject?: string | null;
  body?: string | null;
  occurredAt?: string | null;
  topicCode?: string | null;
  sentimentCode?: string | null;
  actorId?: string | null;
}

export async function saveCrmInteraction(input: SaveCrmInteractionInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    return input.id ?? 'demo-interaction';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.interactionType !== undefined) payload.interaction_type = input.interactionType;
  if (input.direction !== undefined) payload.direction = input.direction;
  if (input.status !== undefined) payload.status = input.status;
  if (input.subject !== undefined) payload.subject = input.subject;
  if (input.body !== undefined) payload.body = input.body;
  if (input.occurredAt !== undefined) payload.occurred_at = input.occurredAt;
  if (input.topicCode !== undefined) payload.topic_code = input.topicCode;
  if (input.sentimentCode !== undefined) payload.sentiment_code = input.sentimentCode;
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  const { data, error } = await client.schema('api').rpc('save_crm_interaction', { p_payload: payload });
  if (error) {
    throw error;
  }
  const id = readString((data as GenericRecord | null)?.id);
  if (!id) {
    throw new Error('Réponse RPC sans id');
  }
  return id;
}

export async function deleteCrmInteraction(id: string): Promise<void> {
  const client = requireCrmClient();
  if (!client) {
    return;
  }
  const { error } = await client.schema('api').rpc('delete_crm_interaction', { p_id: id });
  if (error) {
    throw error;
  }
}

/**
 * Snapshot CRM d'un objet (journal §19) — la forme workspace de `api.list_object_crm`.
 * Source de vérité UNIQUE du parsing : l'enrichissement workspace (object-workspace.ts)
 * et le refresh post-save de SectionCrm consomment tous deux `listObjectCrm`.
 */
export interface ObjectCrmLinkedActor {
  actorId: string;
  displayName: string;
  roleCode: string | null;
  roleName: string | null;
  isPrimary: boolean;
}

export interface ObjectCrmTaskItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueAt: string | null;
}

export interface ObjectCrmSnapshot {
  interactions: ObjectWorkspaceCrmInteractionItem[];
  topics: ObjectWorkspaceCrmTopicCount[];
  /** Acteurs liés à l'objet (actor_object_role) — vue établissement §61. */
  actors: ObjectCrmLinkedActor[];
  tasks: ObjectCrmTaskItem[];
}

export function parseObjectCrmSnapshot(payload: unknown): ObjectCrmSnapshot {
  if (!payload || typeof payload !== 'object') {
    return { interactions: [], topics: [], actors: [], tasks: [] };
  }
  const record = payload as GenericRecord;
  const interactions = Array.isArray(record.interactions)
    ? record.interactions
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map((row) => ({
          id: readString(row.id),
          interactionType: readString(row.interaction_type) || 'note',
          subject: readString(row.subject),
          body: readNullableString(row.body),
          occurredAt: readNullableString(row.occurred_at),
          actorName: readNullableString(row.actor_name),
          topicCode: readNullableString(row.topic_code),
          topicName: readNullableString(row.topic_name),
          sentimentCode: readNullableString(row.sentiment_code),
          sentimentName: readNullableString(row.sentiment_name),
          ownerName: readNullableString(row.owner_name),
          source: readNullableString(row.source),
        }))
    : [];
  const topics = Array.isArray(record.topics)
    ? record.topics
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map((row) => ({ code: readString(row.code), name: readString(row.name), count: Number(row.count ?? 0) }))
    : [];
  const actors = Array.isArray(record.actors)
    ? record.actors
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map((row) => ({
          actorId: readString(row.actor_id),
          displayName: readString(row.display_name),
          roleCode: readNullableString(row.role_code),
          roleName: readNullableString(row.role_name),
          isPrimary: row.is_primary === true,
        }))
    : [];
  const tasks = Array.isArray(record.tasks)
    ? record.tasks
        .filter((row): row is GenericRecord => !!row && typeof row === 'object')
        .map((row) => ({
          id: readString(row.id),
          title: readString(row.title),
          status: readString(row.status),
          priority: readString(row.priority),
          dueAt: readNullableString(row.due_at),
        }))
    : [];
  return { interactions, topics, actors, tasks };
}

/** RPC `api.list_object_crm` + parse. Throws on error (42501 = lecteur hors ORG publisher). */
export async function listObjectCrm(objectId: string): Promise<ObjectCrmSnapshot> {
  const client = requireCrmClient();
  if (!client) {
    return { interactions: [], topics: [], actors: [], tasks: [] }; // mode démo : pas de journal CRM réel
  }
  const { data, error } = await client.schema('api').rpc('list_object_crm', { p_object_id: objectId });
  if (error) {
    throw error;
  }
  return parseObjectCrmSnapshot(data);
}

// Vocabulaire complet des sujets (ref_code, domaine demand_topic — lisible publiquement).
// Lecture PostgREST directe : ref_code n'est PAS une table crm_* (pattern maison des
// vocabulaires ref, policy pub_ref_code_read) — l'interdiction du header ne s'applique pas.
// Nécessaire au formulaire §19 : la distribution de l'objet (list_object_crm.topics) ne
// couvre pas une première interaction (cold-start).
export async function listDemandTopics(): Promise<Array<{ code: string; name: string }>> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return [
      { code: 'demande_de_visite', name: 'Demande de visite' },
      { code: 'modification_infos_bdd', name: 'Modification infos BDD' },
    ];
  }
  const client = getSupabaseClient();
  if (!client) {
    return [];
  }
  const { data, error } = await client
    .from('ref_code')
    .select('code, name, position')
    .eq('domain', 'demand_topic')
    .order('position', { ascending: true });
  if (error) {
    // Fail-soft : le select retombe sur la distribution de l'objet (followUp.topics).
    console.warn('listDemandTopics:', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ code: String(row.code), name: String(row.name) }));
}

export async function userCanWriteCrmNotes(): Promise<boolean> {
  const session = useSessionStore.getState();
  if (session.demoMode || session.role === 'owner' || session.role === 'super_admin') {
    return true;
  }
  const client = getApiClient();
  if (!client) {
    return false;
  }
  const { data, error } = await client.schema('api').rpc('user_has_permission', {
    p_permission_code: 'write_crm_notes',
  });
  if (error) {
    // Fail-closed (lecture seule) mais loggué : un échec RPC ne doit pas passer inaperçu.
    console.warn('userCanWriteCrmNotes:', error.message);
    return false;
  }
  return data === true;
}
