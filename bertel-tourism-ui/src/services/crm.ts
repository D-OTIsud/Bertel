// Service CRM (§58) — toutes les lectures/écritures passent par les RPCs api.* DEFINER
// (spec docs/superpowers/specs/2026-06-11-crm-module-design.md). Les tables crm_* ne sont
// PAS lisibles en PostgREST direct : ne jamais ajouter de client.from('crm_...') ici.
import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockCrmTasks, mockCrmTimeline } from '../data/mock';
import type { CrmInteraction, CrmTask, CrmTaskPriority, CrmTaskStatus, CrmTimelinePage } from '../types/domain';

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
    objectId: readString(record.object_id),
    objectName: readString(record.object_name),
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
