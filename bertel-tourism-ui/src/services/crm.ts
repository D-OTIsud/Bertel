// Service CRM (§61) — toutes les lectures/écritures passent par les RPCs api.* DEFINER
// (spec docs/superpowers/specs/2026-06-11-crm-module-design.md). Les tables crm_* ne sont
// PAS lisibles en PostgREST direct : ne jamais ajouter de client.from('crm_...') ici.
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';
import { mockCrmDirectory, mockCrmTasks, mockCrmTimeline } from '../data/mock';
import type {
  CrmInteraction,
  CrmInteractionReply,
  CrmTask,
  CrmTaskPriority,
  CrmTaskStatus,
  CrmTimelinePage,
} from '../types/domain';
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
    // Rattachement acteur optionnel (rectif PO) — list_crm_tasks joint actor.display_name.
    actorId: readNullableString(record.actor_id),
    actorName: readNullableString(record.actor_name),
    title: readString(record.title),
    description: readNullableString(record.description),
    status: TASK_STATUSES.includes(status) ? status : 'todo',
    priority: TASK_PRIORITIES.includes(priority) ? priority : 'medium',
    dueAt: readNullableString(record.due_at),
    ownerName: readNullableString(record.owner_name),
    relatedInteractionSubject: readNullableString(record.related_interaction_subject),
  };
}

/**
 * Réponse nichée d'un fil de discussion (§65/§66). Forme allégée renvoyée par les 3 read RPCs
 * dans `replies[]` sous chaque racine. Source de parsing UNIQUE (réutilisée par
 * parseCrmInteraction ET parseObjectCrmSnapshot).
 */
export function parseCrmReply(record: GenericRecord): CrmInteractionReply {
  return {
    id: readString(record.id),
    interactionType: readString(record.interaction_type) || 'note',
    body: readNullableString(record.body),
    occurredAt: readNullableString(record.occurred_at),
    createdAt: readNullableString(record.created_at),
    sentimentCode: readNullableString(record.sentiment_code),
    sentimentName: readNullableString(record.sentiment_name),
    ownerName: readNullableString(record.owner_name),
    interlocutorEmail: readNullableString(record.interlocutor_email),
    source: readNullableString(record.source),
  };
}

/** `replies` (array → CrmInteractionReply[]) — défensif : manquant/null/malformé → []. */
function parseReplies(value: unknown): CrmInteractionReply[] {
  return Array.isArray(value)
    ? value.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmReply)
    : [];
}

export function parseCrmInteraction(record: GenericRecord): CrmInteraction {
  return {
    id: readString(record.id),
    // Acteur de l'interaction (rectif PO v5 point 5) — list_crm_timeline le renvoie déjà ;
    // null sur les RPCs qui ne le portent pas (la fiche acteur n'en a pas besoin).
    actorId: readNullableString(record.actor_id),
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
    // §65/§66 — fil de discussion : interlocuteur connu (fix « par Système »), résolution, réponses.
    interlocutorEmail: readNullableString(record.interlocutor_email),
    resolvedAt: readNullableString(record.resolved_at),
    replies: parseReplies(record.replies),
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
  /**
   * Statut PO (rectifs points 6+7) : 'active' = interactions `planned` (à traiter),
   * 'done' = traitées ; absent = toutes. Validé serveur (22023 sinon).
   */
  status?: 'active' | 'done';
  /** Borne basse ISO (`occurred_at >= from`) ; absent = pas de borne (« Tout »). */
  from?: string;
  before?: string;
  beforeId?: string;
  limit?: number;
}

/**
 * RPC `api.list_crm_timeline` — signature 9 args (§63 v4) en arguments NOMMÉS. Les filtres
 * sujet/statut/période (p_status, p_from) sont alignés sur list_crm_directory pour l'onglet
 * Timeline (rectifs PO points 6+7). Toutes + Tout (status/from absents) = la timeline org
 * complète, sans borne de période — corrige le bug « Toutes + Tout ne rendait que 2 mois ».
 */
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
    p_status: filters.status ?? null,
    p_from: filters.from ?? null,
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
  /** Portrait acteur (PO point 4) — null tant qu'aucune photo n'est posée. */
  photoUrl: string | null;
  objects: CrmDirectoryObjectLink[];
  objectCount: number;
  interactionCount: number;
  interactions12m: number;
  lastInteractionAt: string | null;
  lastInteractionType: string | null;
  lastInteractionSubject: string | null;
  lastInteractionObjectName: string | null;
  /**
   * Top sujets de l'acteur — `[{code, name}]` (contrat backend list_crm_directory). Le `code`
   * pilote la teinte (`topicTintOf(code)`) pour une PARITÉ stricte avec la fiche acteur (qui
   * keye déjà par code) ; le `name` est le libellé affiché. Cf. parseCrmDirectoryEntry pour
   * la tolérance à l'ancienne forme `string[]` (cache obsolète).
   */
  topTopics: Array<{ code: string; name: string }>;
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
    photoUrl: readNullableString(record.photo_url),
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
    // Contrat backend : top_topics = `[{code, name}]` (la teinte keye par code → parité fiche).
    // Défensif : on accepte aussi l'ancienne forme `string[]` (cache obsolète) en la mappant
    // sur `{code: '', name}` (clé vide → teinte topic--0, jamais de crash).
    topTopics: Array.isArray(record.top_topics)
      ? record.top_topics
          .map((topic) => {
            if (typeof topic === 'string') return { code: '', name: topic };
            if (topic && typeof topic === 'object') {
              const row = topic as GenericRecord;
              return { code: readString(row.code), name: readString(row.name) };
            }
            return null;
          })
          .filter((topic): topic is { code: string; name: string } => topic !== null)
      : [],
  };
}

/**
 * Filtres serveur de l'annuaire (rectifs PO points 6+7) : le RPC applique sujet / statut /
 * période à TOUS les agrégats (compteurs, dernière interaction, top sujets) — les KPIs de
 * l'annuaire sont donc réactifs sans recalcul client. `status`: 'active' = interactions
 * `planned` (à traiter), 'done' = traitées ; absent = toutes. Sous filtre, les acteurs
 * « lien seul » (0 interaction correspondante) sont exclus par le serveur.
 */
export interface CrmDirectoryFilters {
  topicCode?: string;
  status?: 'active' | 'done';
  /** Bornes ISO — `occurred_at >= from` et `< to`. */
  from?: string;
  to?: string;
}

/** RPC `api.list_crm_directory` — l'annuaire acteurs (filtres serveur optionnels). */
export async function listCrmDirectory(filters: CrmDirectoryFilters = {}): Promise<CrmDirectoryEntry[]> {
  const client = requireCrmClient();
  if (!client) {
    return mockCrmDirectory; // mode démo : fixtures non filtrées (pas de simulation serveur)
  }
  const { data, error } = await client.schema('api').rpc('list_crm_directory', {
    p_topic_code: filters.topicCode ?? null,
    p_status: filters.status ?? null,
    p_from: filters.from ?? null,
    p_to: filters.to ?? null,
  });
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

/** Canal de contact de l'acteur (actor_channel) — PII gated par le RPC (périmètre publisher). */
export interface ActorCrmChannel {
  id: string;
  kindCode: string;
  kindName: string;
  value: string;
  isPrimary: boolean;
}

export interface ActorCrmSnapshot {
  actor: { id: string; displayName: string; firstName: string | null; lastName: string | null; photoUrl: string | null };
  objects: ActorCrmObjectLink[];
  /** Coordonnées réelles de la personne (rectif PO point 4). */
  channels: ActorCrmChannel[];
  /** Interactions de l'acteur, tous contextes — objectId/objectName null = « Général ». */
  interactions: CrmInteraction[];
  topics: Array<{ code: string; name: string; count: number }>;
}

const EMPTY_ACTOR_SNAPSHOT: ActorCrmSnapshot = {
  actor: { id: '', displayName: '', firstName: null, lastName: null, photoUrl: null },
  objects: [],
  channels: [],
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
      photoUrl: readNullableString(actorRecord.photo_url),
    },
    objects: Array.isArray(record.objects)
      ? record.objects
          .filter((row): row is GenericRecord => !!row && typeof row === 'object')
          .map((row) => ({ ...parseDirectoryObjectLink(row), roleCode: readNullableString(row.role_code) }))
      : [],
    channels: Array.isArray(record.channels)
      ? record.channels
          .filter((row): row is GenericRecord => !!row && typeof row === 'object')
          .map((row) => ({
            id: readString(row.id),
            kindCode: readString(row.kind_code),
            kindName: readString(row.kind_name),
            value: readString(row.value),
            isPrimary: row.is_primary === true,
          }))
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
    actor: { id: entry.actorId, displayName: entry.displayName, firstName: null, lastName: null, photoUrl: entry.photoUrl },
    objects: entry.objects.map((object) => ({ ...object, roleCode: null })),
    channels: [], // pas de PII fabriquée en démo
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
  /** Rattachement acteur optionnel (rectif PO) — validé côté serveur. */
  actorId?: string;
  title?: string;
  description?: string | null;
  status?: CrmTaskStatus;
  priority?: CrmTaskPriority;
  dueAt?: string | null;
  /**
   * Assignation (PO point 4) — référent de la tâche. UUID d'un membre de l'ORG du caller ;
   * le serveur valide l'appartenance (sinon 22023). Omis = défaut serveur (le saisisseur).
   */
  owner?: string;
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
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueAt !== undefined) payload.due_at = input.dueAt;
  if (input.owner !== undefined) payload.owner = input.owner;
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

/* ===== Assignables (PO point 4 — api.list_crm_assignees) ========================
   Membres actifs de(s) l'ORG du caller, candidats au référent d'une tâche. Aujourd'hui
   1 seul utilisateur seedé — la liste à 1 entrée doit fonctionner (le sélecteur la
   pré-coche). `save_crm_task.owner` valide que l'id choisi est bien un membre. */
export interface CrmAssignee {
  userId: string;
  displayName: string;
}

export function parseCrmAssignee(record: GenericRecord): CrmAssignee {
  return {
    userId: readString(record.user_id),
    displayName: readString(record.display_name),
  };
}

// Démo : 2 personnes mock (le sélecteur d'assignation a de quoi varier sans backend).
const MOCK_CRM_ASSIGNEES: CrmAssignee[] = [
  { userId: 'usr-local-marie', displayName: 'Marie D.' },
  { userId: 'usr-local-jean', displayName: 'Jean P.' },
];

/** RPC `api.list_crm_assignees` — membres assignables de l'ORG du caller. */
export async function listCrmAssignees(): Promise<CrmAssignee[]> {
  const client = requireCrmClient();
  if (!client) {
    return MOCK_CRM_ASSIGNEES;
  }
  const { data, error } = await client.schema('api').rpc('list_crm_assignees', {});
  if (error) {
    throw error;
  }
  return Array.isArray(data)
    ? data.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseCrmAssignee)
    : [];
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
  /**
   * Réponse (§65/§66) — id de l'interaction RACINE. Le backend hérite alors le contexte
   * acteur/objet de la racine : NE PAS passer actorId/objectId sur une réponse (une réponse
   * d'une réponse se rattache automatiquement à la racine côté serveur).
   */
  parentInteractionId?: string;
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
  if (input.parentInteractionId !== undefined) payload.parent_interaction_id = input.parentInteractionId;
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

/* ===== Authoring acteur + canaux (§61 rectifs PO points 4+5) =====================
   INSERT acteur : object_id REQUIS — l'acteur entre dans le périmètre CRM par son lien
   actor_object_role (sans lui, le créateur ne pourrait ni le relire ni l'éditer).
   role_code par défaut 'operator' côté serveur ; PAS de sélecteur de rôle en v1
   (ref_actor_role est une table simple non-ref_code et les seeds ne portent
   qu'operator — proposer un choix serait une fausse affordance). */

export interface SaveCrmActorInput {
  id?: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  /** INSERT seulement. */
  objectId?: string;
  /** INSERT seulement — défaut serveur 'operator'. */
  roleCode?: string;
  /**
   * Portrait acteur (PO point 4) — l'URL est normalement posée par la route d'upload
   * /api/actor-photo/upload. Clé présente = écrite ; chaîne vide = effacement explicite
   * (le serveur fait `NULLIF(photo_url,'')`). Ne PAS envoyer la clé pour ne pas toucher.
   */
  photoUrl?: string;
}

export async function saveCrmActor(input: SaveCrmActorInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    return input.id ?? 'demo-actor';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.firstName !== undefined) payload.first_name = input.firstName;
  if (input.lastName !== undefined) payload.last_name = input.lastName;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.roleCode !== undefined) payload.role_code = input.roleCode;
  // photo_url partiel : clé présente (y compris '') = écrite ; '' = effacement serveur.
  if (input.photoUrl !== undefined) payload.photo_url = input.photoUrl;
  const { data, error } = await client.schema('api').rpc('save_crm_actor', { p_payload: payload });
  if (error) {
    throw error;
  }
  const id = readString((data as GenericRecord | null)?.id);
  if (!id) {
    throw new Error('Réponse RPC sans id');
  }
  return id;
}

export interface SaveActorChannelInput {
  /** UPDATE quand présent. */
  id?: string;
  /** INSERT : requis. */
  actorId?: string;
  kindCode?: string;
  value?: string;
  isPrimary?: boolean;
}

export async function saveActorChannel(input: SaveActorChannelInput): Promise<string> {
  const client = requireCrmClient();
  if (!client) {
    return input.id ?? 'demo-channel';
  }
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  if (input.kindCode !== undefined) payload.kind_code = input.kindCode;
  if (input.value !== undefined) payload.value = input.value;
  if (input.isPrimary !== undefined) payload.is_primary = input.isPrimary;
  const { data, error } = await client.schema('api').rpc('save_actor_channel', { p_payload: payload });
  if (error) {
    throw error;
  }
  const id = readString((data as GenericRecord | null)?.id);
  if (!id) {
    throw new Error('Réponse RPC sans id');
  }
  return id;
}

export async function deleteActorChannel(id: string): Promise<void> {
  const client = requireCrmClient();
  if (!client) {
    return;
  }
  const { error } = await client.schema('api').rpc('delete_actor_channel', { p_id: id });
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
  /** Portrait acteur (PO point 4) — rendu dans le rail « Acteurs liés » de la vue objet. */
  photoUrl: string | null;
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
          // Acteur de l'interaction (contrat backend) — la carte de la vue objet ouvre la
          // fiche acteur directement par cet id (plus de résolution fragile par nom).
          actorId: readNullableString(row.actor_id),
          actorName: readNullableString(row.actor_name),
          topicCode: readNullableString(row.topic_code),
          topicName: readNullableString(row.topic_name),
          sentimentCode: readNullableString(row.sentiment_code),
          sentimentName: readNullableString(row.sentiment_name),
          ownerName: readNullableString(row.owner_name),
          source: readNullableString(row.source),
          // §65/§66 — fil de discussion (même contrat que parseCrmInteraction).
          interlocutorEmail: readNullableString(row.interlocutor_email),
          resolvedAt: readNullableString(row.resolved_at),
          replies: parseReplies(row.replies),
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
          photoUrl: readNullableString(row.photo_url),
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

// Vocabulaire des canaux de contact (ref_code, domaine contact_kind — lisible publiquement).
// Même pattern de lecture PostgREST directe que listDemandTopics : ref_code n'est PAS une
// table crm_* (policy pub_ref_code_read). Sert au modal d'édition des coordonnées acteur.
export async function listContactKinds(): Promise<Array<{ code: string; name: string }>> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    return [
      { code: 'phone', name: 'Téléphone' },
      { code: 'mobile', name: 'Mobile' },
      { code: 'email', name: 'Email' },
      { code: 'website', name: 'Site web' },
    ];
  }
  const client = getSupabaseClient();
  if (!client) {
    return [];
  }
  const { data, error } = await client
    .from('ref_code')
    .select('code, name, position')
    .eq('domain', 'contact_kind')
    .order('position', { ascending: true });
  if (error) {
    // Fail-soft : sans vocabulaire, le modal d'édition désactive l'ajout de canal.
    console.warn('listContactKinds:', error.message);
    return [];
  }
  return (data ?? []).map((row) => ({ code: String(row.code), name: String(row.name) }));
}

/* ===== Suggestions de contacts (PO point 2) =====================================
   À la création d'un acteur, une fois l'établissement de rattachement choisi, on propose
   en un clic les contacts DÉJÀ connus de cet établissement (contact_channel §03) + des
   acteurs déjà liés (actor_channel). RPC `api.list_object_contact_suggestions(object_id)`
   gated `user_can_write_crm` (le caller AUTHOR un acteur sous cet objet) — 42501 si non
   autorisé ⇒ on renvoie [] (le bloc se masque, le modal ne casse pas). */

export interface ObjectContactSuggestion {
  kindCode: string;
  kindName: string;
  value: string;
  isPrimary: boolean;
  /** 'établissement' (contact_channel §03) ou 'acteur lié' (actor_channel) — affiché en sourdine. */
  source: string;
}

export function parseContactSuggestion(record: GenericRecord): ObjectContactSuggestion {
  return {
    kindCode: readString(record.kind_code),
    kindName: readString(record.kind_name),
    value: readString(record.value),
    isPrimary: record.is_primary === true,
    source: readString(record.source),
  };
}

// Démo : quelques suggestions plausibles (pas d'appel réseau, pas de fabrication serveur).
const MOCK_CONTACT_SUGGESTIONS: ObjectContactSuggestion[] = [
  { kindCode: 'email', kindName: 'Email', value: 'contact@etablissement.re', isPrimary: true, source: 'établissement' },
  { kindCode: 'phone', kindName: 'Téléphone', value: '0262 00 00 00', isPrimary: false, source: 'établissement' },
];

/**
 * RPC `api.list_object_contact_suggestions` — contacts connus de l'établissement, à ajouter
 * en un clic à un nouvel acteur. 42501 (gate user_can_write_crm) ⇒ [] (silencieux : le
 * caller peut ne pas avoir le droit CRM sur cet objet, ou l'objet n'a aucun contact).
 */
export async function listObjectContactSuggestions(objectId: string): Promise<ObjectContactSuggestion[]> {
  const client = requireCrmClient();
  if (!client) {
    return MOCK_CONTACT_SUGGESTIONS;
  }
  const { data, error } = await client
    .schema('api')
    .rpc('list_object_contact_suggestions', { p_object_id: objectId });
  if (error) {
    // Fail-soft : un refus de gate (42501) ou un objet sans contact ne doit pas casser le modal.
    return [];
  }
  return Array.isArray(data)
    ? data.filter((row): row is GenericRecord => !!row && typeof row === 'object').map(parseContactSuggestion)
    : [];
}

/* ===== Upload portrait acteur (PO point 4) ======================================
   Mêmes invariants que le pipeline média (CLAUDE.md) : la route /api/actor-photo/upload
   est le SEUL écrivain (autorise as-the-caller via user_can_write_crm_actor, strippe l'EXIF,
   écrit en service-role, pose actor.photo_url). Le helper client ne fait QUE poster le
   FormData avec le bearer de session et lire { url }. Démo : URL locale, pas de réseau. */
export async function uploadActorPhoto(actorId: string, file: File): Promise<string> {
  const session = useSessionStore.getState();
  if (session.demoMode) {
    // Mode démo : aperçu local (object URL) — aucun appel réseau, aucune photo réelle.
    return typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
      ? URL.createObjectURL(file)
      : 'demo://actor-photo';
  }
  const client = getSupabaseClient();
  const accessToken = client ? (await client.auth.getSession()).data.session?.access_token ?? '' : '';
  const body = new FormData();
  body.append('actorId', actorId);
  body.append('file', file);
  const response = await fetch('/api/actor-photo/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const payload = (await response.json()) as { url?: string };
  if (!payload.url) {
    throw new Error('Réponse upload sans url');
  }
  return payload.url;
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
