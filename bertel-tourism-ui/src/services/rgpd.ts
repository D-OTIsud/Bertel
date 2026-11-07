// RGPD Art. 17 — client service. Calls POST /api/rgpd/erase, which runs the SQL erasure RPC
// as the caller (superuser-gated) then deletes the reported Storage files / auth account.
import { apiError } from './api-error';

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

export async function requestErasure(input: ErasureInput): Promise<ErasureResult> {
  const response = await fetch('/api/rgpd/erase', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${input.accessToken}`,
    },
    body: JSON.stringify({
      subjectKind: input.subjectKind,
      subjectId: input.subjectId,
      mode: input.mode,
      reason: input.reason ?? null,
    }),
  });

  if (!response.ok) {
    throw await apiError(response);
  }

  return (await response.json()) as ErasureResult;
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

  return (await response.json()) as ErasureResult;
}
