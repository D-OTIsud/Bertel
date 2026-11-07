import type {
  SaveCrmTaskInput,
  SaveCrmInteractionInput,
  SaveCrmActorInput,
  SaveActorChannelInput,
} from './crm';

type GenericRecord = Record<string, unknown>;

export function buildCrmTaskPayload(input: SaveCrmTaskInput): GenericRecord {
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  if (input.title !== undefined) payload.title = input.title;
  if (input.description !== undefined) payload.description = input.description;
  if (input.status !== undefined) payload.status = input.status;
  if (input.priority !== undefined) payload.priority = input.priority;
  if (input.dueAt !== undefined) payload.due_at = input.dueAt;
  // 16w — clé présente = réconcile exact vers cet ensemble ; absente = pas de changement.
  if (input.assigneeIds !== undefined) payload.assignee_ids = input.assigneeIds;
  if (input.owner !== undefined) payload.owner = input.owner;
  // §66 — clé présente = écrite ('' = détachement) ; absente = pas de changement.
  if (input.relatedInteractionId !== undefined) payload.related_interaction_id = input.relatedInteractionId;
  return payload;
}

export function buildCrmInteractionPayload(input: SaveCrmInteractionInput): GenericRecord {
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
  return payload;
}

export function buildCrmActorPayload(input: SaveCrmActorInput): GenericRecord {
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.displayName !== undefined) payload.display_name = input.displayName;
  // gender partiel : clé présente (y compris '') = écrite ; '' = effacement serveur (organisation).
  if (input.gender !== undefined) payload.gender = input.gender;
  if (input.firstName !== undefined) payload.first_name = input.firstName;
  if (input.lastName !== undefined) payload.last_name = input.lastName;
  if (input.objectId !== undefined) payload.object_id = input.objectId;
  if (input.roleCode !== undefined) payload.role_code = input.roleCode;
  // photo_url partiel : clé présente (y compris '') = écrite ; '' = effacement serveur.
  if (input.photoUrl !== undefined) payload.photo_url = input.photoUrl;
  return payload;
}

export function buildActorChannelPayload(input: SaveActorChannelInput): GenericRecord {
  const payload: GenericRecord = {};
  if (input.id !== undefined) payload.id = input.id;
  if (input.actorId !== undefined) payload.actor_id = input.actorId;
  if (input.kindCode !== undefined) payload.kind_code = input.kindCode;
  if (input.value !== undefined) payload.value = input.value;
  if (input.isPrimary !== undefined) payload.is_primary = input.isPrimary;
  if (input.isPublic !== undefined) payload.is_public = input.isPublic;
  return payload;
}
