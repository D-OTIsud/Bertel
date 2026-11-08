// RGPD Art. 17 — client service. Calls POST /api/rgpd/erase, which runs the SQL erasure RPC
// as the caller (superuser-gated) then deletes the reported Storage files / auth account.
import { API_ERROR_LABELS, apiError } from './api-error';

export const ERASURE_SUBJECT_KINDS = [
  'actor',
  'incident',
  'review',
  'object_legal',
  'contact_channel',
  'user',
] as const;
export type ErasureSubjectKind = (typeof ERASURE_SUBJECT_KINDS)[number];

export type ErasureMode = 'anonymize' | 'delete';

export const ERASURE_KIND_LABELS: Record<ErasureSubjectKind, string> = {
  actor: 'Acteur — identité, canaux, consentements, CRM lié',
  incident: "Déclarant d'un signalement (incident)",
  review: "Auteur d'un avis (object_review)",
  object_legal: 'Donnée légale — entrepreneur individuel',
  contact_channel: 'Coordonnée de contact',
  user: 'Compte utilisateur interne',
};

/** Human hint about what identifier to paste for a given subject kind. */
export const ERASURE_ID_HINT: Record<ErasureSubjectKind, string> = {
  actor: "UUID de l'acteur (actor.id)",
  incident: 'UUID du signalement (incident_report.id)',
  review: "UUID de l'avis (object_review.id)",
  object_legal: 'UUID de la ligne légale (object_legal.id)',
  contact_channel: 'UUID de la coordonnée (contact_channel.id)',
  user: "UUID du compte (auth.users.id / app_user_profile.id)",
};

export interface ErasureInput {
  /** Référence du START, persistée localement avant l'appel. Distincte du vrai operationId. */
  requestId: string;
  subjectKind: ErasureSubjectKind;
  subjectId: string;
  mode: ErasureMode;
  reason?: string | null;
  accessToken: string;
}

export type CleanupTaskAction = 'storage_remove' | 'auth_delete';
export type CleanupTaskStatus = 'pending' | 'succeeded' | 'failed';

export interface CleanupTask {
  id: string;
  action: CleanupTaskAction;
  metadata: Record<string, unknown>;
  status: CleanupTaskStatus;
  attempts: number;
  lastError: string | null;
}

export type ErasureStatus = 'completed' | 'partial' | 'failed';

/**
 * Contrat retourné par /api/rgpd/erase (démarrage OU reprise). `ok` est faux dès que `status`
 * n'est pas `'completed'` — le client ne doit JAMAIS afficher un titre de succès quand
 * `status !== 'completed'` (tâche non acquittée et/ou document personnel encore retenu ailleurs).
 */
export interface ErasureResult {
  ok: boolean;
  status: ErasureStatus;
  operationId: string;
  report: Record<string, unknown>;
  tasks: CleanupTask[];
  /** Le nettoyage a peut-être progressé mais son statut réel n'a pas pu être reconfirmé
   *  (échec de rechargement) — `counts`/`tasks` reflètent alors un instantané non garanti à
   *  jour ; ne jamais l'afficher comme un état stable. Toujours accompagné de `status !== 'completed'`. */
  cleanupStatusUnavailable: boolean;
  counts: { total: number; succeeded: number; pending: number; failed: number };
}

export interface ErasureStartLookup {
  requestId: string;
  operationId: string;
}

const OPERATION_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ERASURE_STATUSES: readonly string[] = ['completed', 'partial', 'failed'];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidErasureEnvelope(): Error {
  return new Error(API_ERROR_LABELS.operation_lookup_failed);
}

/** Une réponse hors contrat reste un statut inconnu : jamais lue comme un résultat. */
function parseErasureResult(value: unknown): ErasureResult {
  if (
    !isPlainObject(value) ||
    typeof value.ok !== 'boolean' ||
    typeof value.status !== 'string' ||
    !ERASURE_STATUSES.includes(value.status) ||
    typeof value.operationId !== 'string' ||
    !OPERATION_UUID_RE.test(value.operationId) ||
    !isPlainObject(value.report) ||
    !Array.isArray(value.tasks) ||
    !value.tasks.every((task) => isPlainObject(task) && ['pending', 'succeeded', 'failed'].includes(task.status as string)) ||
    typeof value.cleanupStatusUnavailable !== 'boolean' ||
    !isPlainObject(value.counts) ||
    !['total', 'succeeded', 'pending', 'failed'].every(
      (name) => Number.isSafeInteger((value.counts as Record<string, unknown>)[name]) &&
        ((value.counts as Record<string, number>)[name] >= 0),
    )
  ) {
    throw invalidErasureEnvelope();
  }
  const tasks = value.tasks as Record<string, unknown>[];
  const counts = value.counts as Record<string, number>;
  const succeeded = tasks.filter((task) => task.status === 'succeeded').length;
  const allDone = succeeded === tasks.length;
  const expectedOk = allDone && value.report.manualReviewRequired !== true && !value.cleanupStatusUnavailable;
  const expectedStatus = expectedOk ? 'completed' :
    value.cleanupStatusUnavailable || succeeded > 0 || allDone ? 'partial' : 'failed';
  if (counts.total !== tasks.length || counts.succeeded !== succeeded ||
      counts.pending !== tasks.filter((task) => task.status === 'pending').length ||
      counts.failed !== tasks.filter((task) => task.status === 'failed').length ||
      value.ok !== expectedOk || value.status !== expectedStatus) {
    throw invalidErasureEnvelope();
  }
  return value as unknown as ErasureResult;
}

export async function requestErasure(input: ErasureInput): Promise<ErasureResult> {
  const response = await fetch('/api/rgpd/erase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      requestId: input.requestId,
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      mode: input.mode,
      reason: input.reason ?? null,
    }),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return parseErasureResult(await response.json());
}

/**
 * Retrouve le vrai operationId d'un START à partir de sa référence. Lecture seule : une absence ou
 * une erreur lève une exception et n'autorise ni START ni retrait de la référence.
 */
export async function lookupErasureStart(requestId: string, accessToken: string): Promise<ErasureStartLookup> {
  const response = await fetch('/api/rgpd/erase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ requestId }),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  const payload: unknown = await response.json();
  if (
    !isPlainObject(payload) ||
    Object.keys(payload).length !== 2 ||
    typeof payload.requestId !== 'string' ||
    payload.requestId.toLowerCase() !== requestId.toLowerCase() ||
    typeof payload.operationId !== 'string' ||
    !OPERATION_UUID_RE.test(payload.operationId) ||
    payload.operationId.toLowerCase() === requestId.toLowerCase()
  ) {
    throw invalidErasureEnvelope();
  }
  return { requestId: payload.requestId, operationId: payload.operationId };
}

/**
 * Reprend une opération d'effacement existante (traite ses tâches encore en attente/échouées) —
 * ne rappelle JAMAIS le RPC d'effacement, ne peut donc jamais re-effacer un sujet.
 */
export async function resumeErasureCleanup(operationId: string, accessToken: string): Promise<ErasureResult> {
  const response = await fetch('/api/rgpd/erase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ operationId }),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return parseErasureResult(await response.json());
}
