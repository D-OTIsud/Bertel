import type { ObjectWorkspaceExternalIdentifierItem } from '../../../services/object-workspace-parser';

export interface ExternalIdSourceOption {
  v: string;
  l: string;
}

/**
 * Non-canonical external-id sources the editor may author. OTI (canonical ID) and SU
 * (Supabase row id) are platform-owned and intentionally absent — the RPC also rejects them
 * (api.rpc_upsert_object_external_id raises CANONICAL_SOURCE). Codes mirror SectionSync's
 * SOURCE_LABELS map (AT=Airtable, AP=Apidae, DT=DataTourisme).
 */
export const EXTERNAL_ID_SOURCE_OPTIONS: ExternalIdSourceOption[] = [
  { v: 'AT', l: 'Airtable (recId)' },
  { v: 'AP', l: 'Apidae (object_id)' },
  { v: 'DT', l: 'DataTourisme (URI)' },
];

/** Mirror of the RPC's canonical guard: OTI / SU (case-insensitive) or any *canonical* substring. */
export function isCanonicalSourceSystem(sourceSystem: string): boolean {
  const normalized = sourceSystem.trim();
  if (!normalized) {
    return false;
  }
  const upper = normalized.toUpperCase();
  return upper === 'OTI' || upper === 'SU' || normalized.toLowerCase().includes('canonical');
}

/** Empty add-draft — no id (insert), first non-canonical source preselected, empty org (server-derived). */
export function createExternalIdDraft(): ObjectWorkspaceExternalIdentifierItem {
  return {
    id: '',
    organizationObjectId: '',
    sourceSystem: EXTERNAL_ID_SOURCE_OPTIONS[0].v,
    externalId: '',
    lastSyncedAt: '',
    createdAt: '',
    updatedAt: '',
  };
}

/** Save is disabled until a non-canonical source AND a non-empty identifier are present. */
export function isExternalIdSaveDisabled(draft: ObjectWorkspaceExternalIdentifierItem): boolean {
  const source = draft.sourceSystem.trim();
  const identifier = draft.externalId.trim();
  return source === '' || identifier === '' || isCanonicalSourceSystem(source);
}
