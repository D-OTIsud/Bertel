// Service Modération (P2.1, §120) — toutes les lectures/écritures passent par les RPCs api.*
// DEFINER (migration_moderation_rpcs.sql). La table `pending_change` n'est PAS lisible/écrivable
// en PostgREST direct (RLS admin-only) : ne jamais ajouter de client.from('pending_change') ici.
//
// Décision clé (Option A) : approve ré-invoque côté serveur le writer structuré nommé par
// metadata->>'rpc' (whitelisté). Le front ne dispatche RIEN — il dépose juste l'enveloppe
// (payload + metadata.rpc) via submit, puis approuve/rejette par id.
import { getApiClient } from '../lib/supabase';
import { mapDatabaseError } from './api-error';
import { useSessionStore } from '../store/session-store';
import { mockPendingChanges } from '../data/mock';
import type { PendingChangeItem } from '../types/domain';

type GenericRecord = Record<string, unknown>;

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}
function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Mappe une ligne d'api.list_pending_changes vers la forme domaine PendingChangeItem. */
export function parsePendingChange(row: GenericRecord): PendingChangeItem {
  return {
    id: readString(row.id),
    objectId: readNullableString(row.object_id) ?? undefined,
    objectName: readString(row.object_name),
    author: readString(row.submitter_label),
    field: readString(row.field_label),
    before: readString(row.before_value),
    after: readString(row.after_value),
    submittedAt: readString(row.submitted_at),
    status: readString(row.status, 'pending'),
    targetTable: readString(row.target_table),
    targetPk: readNullableString(row.target_pk),
    action: readString(row.action),
    reviewerLabel: readNullableString(row.reviewer_label),
    reviewedAt: readNullableString(row.reviewed_at),
    reviewNote: readNullableString(row.review_note),
    appliedAt: readNullableString(row.applied_at),
    // 18a/D9 — colonnes ajoutées par la §7.3 : de quoi grouper la file par envoi partenaire.
    submissionId: readNullableString(row.submission_id),
    submissionNote: readNullableString(row.submission_note),
    actorLabel: readNullableString(row.actor_label),
    // FAIL-CLOSED, et c'est le point le plus important de ce mapping. `row.manual_apply === true`
    // écraserait en `false` une colonne ABSENTE — or `false` veut dire « la machine applique »,
    // donc approbation en un clic. On préserve donc l'état INCONNU (undefined) : l'écran
    // exigera l'attestation tant qu'il n'a pas la preuve du contraire.
    manualApply: typeof row.manual_apply === 'boolean' ? row.manual_apply : undefined,
  };
}

function requireApiClient() {
  const client = getApiClient();
  if (!client) {
    throw new Error('Supabase non configuré. Activez explicitement le mode démo pour utiliser les données mock.');
  }
  return client;
}

/**
 * File de modération auto-autorisée côté serveur (§36) : ne renvoie que les suggestions des objets
 * que l'appelant peut modérer. `status` filtre le statut (NULL = tous), `objectId` restreint à un objet.
 */
export async function listPendingChanges(
  status: string | null = 'pending',
  objectId: string | null = null,
  limit = 50,
  offset = 0,
): Promise<PendingChangeItem[]> {
  if (useSessionStore.getState().demoMode) {
    // Le filtre par objet est honoré ICI AUSSI : Task 19 ouvre /moderation?object=<id>. Une
    // branche démo qui ignorerait `objectId` afficherait la file de TOUTE l'organisation sous
    // un titre qui promet une seule fiche — l'agent trancherait la ligne d'un autre partenaire.
    return mockPendingChanges.filter(
      (item) =>
        (status ? (item.status ?? 'pending') === status : true) && (objectId ? item.objectId === objectId : true),
    );
  }
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_pending_changes', {
    p_status: status,
    p_object_id: objectId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw mapDatabaseError(error, 'File de modération indisponible.');
  }
  return Array.isArray(data) ? data.map((row) => parsePendingChange(row as GenericRecord)) : [];
}

export interface SubmitPendingChangeInput {
  objectId: string | null;
  targetTable: string;
  targetPk?: string | null;
  action: 'insert' | 'update' | 'delete';
  payload: unknown;
  /** Enveloppe : metadata.rpc nomme le writer structuré à ré-invoquer à l'approbation (Option A). */
  metadata?: Record<string, unknown> | null;
}

export async function submitPendingChange(input: SubmitPendingChangeInput): Promise<string> {
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('submit_pending_change', {
    p_object_id: input.objectId,
    p_target_table: input.targetTable,
    p_target_pk: input.targetPk ?? null,
    p_action: input.action,
    p_payload: input.payload,
    p_metadata: input.metadata ?? null,
  });
  if (error) {
    throw mapDatabaseError(error, 'Soumission de la suggestion impossible.');
  }
  if (typeof data !== 'string') {
    throw new Error('Réponse RPC sans id');
  }
  return data;
}

/**
 * 18a/D9 — `appliedManually` est une ATTESTATION nominative : le serveur l'estampille en
 * `metadata.attested_by/attested_at` et pose `status='approved'` (jamais `applied` : rien n'a
 * été écrit dans la fiche). Sur une ligne sans writer, l'approbation SANS attestation est
 * refusée en 22023 avec le message qui dit le remède. Le paramètre est toujours transmis
 * explicitement : laisser le DÉFAUT SQL trancher reviendrait à ne pas choisir.
 */
export async function approvePendingChange(
  id: string,
  reviewNote: string | null = null,
  appliedManually = false,
): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('approve_pending_change', {
    p_id: id,
    p_review_note: reviewNote,
    p_applied_manually: appliedManually,
  });
  if (error) {
    throw mapDatabaseError(error, 'Approbation impossible.');
  }
}

/**
 * 18a/D9 — approuve un ENVOI entier. `includeManual=false` (défaut) laisse DÉLIBÉRÉMENT les
 * rubriques sans report automatique en attente : l'envoi reste ouvert tant que l'office ne les
 * a pas reportées et attestées. Attention : sur un envoi 100 % manuel, un appel non attesté
 * réussit en n'ayant rien fait — l'écran doit donc le bloquer avant d'en arriver là.
 */
export async function approveFicheSubmission(
  submissionId: string,
  reviewNote: string | null = null,
  includeManual = false,
): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('approve_fiche_submission', {
    p_submission_id: submissionId,
    p_review_note: reviewNote,
    p_include_manual: includeManual,
  });
  if (error) {
    throw mapDatabaseError(error, 'Approbation de l’envoi impossible.');
  }
}

/** 18a/D9 — refuse un ENVOI entier. Motif obligatoire : c'est la seule chose que le partenaire
 *  recevra pour comprendre, et sans elle il re-soumet à l'identique. Garde client doublant
 *  celle du RPC (défense en profondeur). */
export async function rejectFicheSubmission(submissionId: string, reviewNote: string): Promise<void> {
  if (!reviewNote || reviewNote.trim().length === 0) {
    throw new Error('Un motif de refus est obligatoire.');
  }
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('reject_fiche_submission', {
    p_submission_id: submissionId,
    p_review_note: reviewNote,
  });
  if (error) {
    throw mapDatabaseError(error, 'Refus de l’envoi impossible.');
  }
}

export async function rejectPendingChange(id: string, reviewNote: string): Promise<void> {
  // Garde client : un motif est obligatoire (le serveur l'exige aussi — défense en profondeur).
  if (!reviewNote || reviewNote.trim().length === 0) {
    throw new Error('Un motif de refus est obligatoire.');
  }
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('reject_pending_change', {
    p_id: id,
    p_review_note: reviewNote,
  });
  if (error) {
    throw mapDatabaseError(error, 'Refus impossible.');
  }
}
