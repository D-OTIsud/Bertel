// Service Modération (P2.1, §120) — toutes les lectures/écritures passent par les RPCs api.*
// DEFINER (migration_moderation_rpcs.sql). La table `pending_change` n'est PAS lisible/écrivable
// en PostgREST direct (RLS admin-only) : ne jamais ajouter de client.from('pending_change') ici.
//
// Décision clé (Option A) : approve ré-invoque côté serveur le writer structuré nommé par
// metadata->>'rpc' (whitelisté). Le front ne dispatche RIEN — il dépose juste l'enveloppe
// (payload + metadata.rpc) via submit, puis approuve/rejette par id.
import { getApiClient } from '../lib/supabase';
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
    return mockPendingChanges.filter((item) => (status ? (item.status ?? 'pending') === status : true));
  }
  const client = requireApiClient();
  const { data, error } = await client.schema('api').rpc('list_pending_changes', {
    p_status: status,
    p_object_id: objectId,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    throw new Error(error.message || 'File de modération indisponible.');
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
    throw new Error(error.message || 'Soumission de la suggestion impossible.');
  }
  if (typeof data !== 'string') {
    throw new Error('Réponse RPC sans id');
  }
  return data;
}

export async function approvePendingChange(id: string, reviewNote: string | null = null): Promise<void> {
  const client = requireApiClient();
  const { error } = await client.schema('api').rpc('approve_pending_change', {
    p_id: id,
    p_review_note: reviewNote,
  });
  if (error) {
    throw new Error(error.message || 'Approbation impossible.');
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
    throw new Error(error.message || 'Refus impossible.');
  }
}
