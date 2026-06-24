import { useCallback, useState } from 'react';
import {
  useSaveObjectWorkspaceModuleMutation,
  type SaveWorkspaceModuleInput,
} from '../../hooks/useExplorerQueries';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { submitPendingChange } from '../../services/moderation';
import { MODULE_KEY_MAP } from './editor-state';
import { buildContributorSubmission } from './contributor-proposal';

export interface SaveBatchPlan {
  /** Modules written directly via the per-module save-RPC (canonical writer). */
  writable: WorkspaceModuleId[];
  /** P1.3 — modules routed to the moderation proposal flow (contributor, no direct canonical write). */
  proposals: WorkspaceModuleId[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
}

/**
 * Pure: split the dirty modules into direct writes, moderation proposals, and blocked.
 *
 * P1.3 fork — when `canWriteCanonicalDirect` is false the caller is a contributor: EVERY dirty
 * module is routed to a moderation proposal (Option B, all 22 sections) and nothing is blocked
 * here (the backend `user_can_write_object_canonical` gate is the real security on apply). When
 * the caller IS a canonical writer, the historical per-module split applies (direct write when the
 * module is directly writable or proposal-preparable, otherwise blocked).
 */
export function planSaveBatch(
  dirtyModules: WorkspaceModuleId[],
  permissions: ObjectWorkspacePermissions,
  canWriteCanonicalDirect = true,
): SaveBatchPlan {
  const writable: WorkspaceModuleId[] = [];
  const proposals: WorkspaceModuleId[] = [];
  const blocked: { module: WorkspaceModuleId; reason: string }[] = [];

  for (const module of dirtyModules) {
    if (!canWriteCanonicalDirect) {
      // Contributor: every edit becomes a moderation proposal, regardless of per-module flags.
      proposals.push(module);
      continue;
    }
    const access = permissions[MODULE_KEY_MAP[module]];
    if (access?.canDirectWrite || access?.canPrepareProposal) {
      writable.push(module);
    } else {
      blocked.push({ module, reason: access?.disabledReason ?? 'Lecture seule' });
    }
  }
  return { writable, proposals, blocked };
}

export interface EditorSaveResult {
  /** Modules persisted directly (canonical writer). */
  saved: WorkspaceModuleId[];
  /** P1.3 — modules submitted to the moderation queue as pending changes (contributor). */
  submitted: WorkspaceModuleId[];
  failed: { module: WorkspaceModuleId; message: string }[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
}

export interface EditorSaveOptions {
  /** False ⇒ contributor: route every dirty module to the moderation proposal flow. Default true. */
  canWriteCanonicalDirect?: boolean;
  /** Saved snapshot used to build the before/after diff stored on each proposal. Defaults to draft. */
  baseline?: ObjectWorkspaceModules;
}

/** Builds the discriminated save-mutation argument for one module. */
function buildSaveArg(
  module: WorkspaceModuleId,
  draft: ObjectWorkspaceModules,
  permissions: ObjectWorkspacePermissions,
): SaveWorkspaceModuleInput {
  switch (module) {
    case 'descriptions':
      return {
        moduleId: 'descriptions',
        value: draft.descriptions,
        canEditCanonical: permissions.descriptions.canEditCanonical,
        canEditOrgEnrichment: permissions.descriptions.canEditOrgEnrichment,
        canEditPlaceDescriptions: permissions.descriptions.canEditPlaceDescriptions,
      };
    case 'media':
      return {
        moduleId: 'media',
        value: draft.media,
        canEditPlaceMedia: permissions.media.canEditPlaceMedia,
      };
    case 'general-info':
      return { moduleId: 'general-info', value: draft.generalInfo };
    case 'publication':
      return { moduleId: 'general-info', value: draft.generalInfo };
    default:
      return { moduleId: module, value: draft[MODULE_KEY_MAP[module]] } as unknown as SaveWorkspaceModuleInput;
  }
}

/**
 * Batched global save: persists every dirty, writable module via the existing per-module RPC, and
 * (P1.3) submits every contributor proposal via `api.submit_pending_change`. Partial success is
 * supported — a failed module keeps its error and stays dirty while the others commit/submit.
 */
export function useEditorSave(objectId: string) {
  const mutation = useSaveObjectWorkspaceModuleMutation(objectId);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      dirtyModules: WorkspaceModuleId[],
      permissions: ObjectWorkspacePermissions,
      draft: ObjectWorkspaceModules,
      options: EditorSaveOptions = {},
    ): Promise<EditorSaveResult> => {
      const canWriteCanonicalDirect = options.canWriteCanonicalDirect ?? true;
      const baseline = options.baseline ?? draft;
      const plan = planSaveBatch(dirtyModules, permissions, canWriteCanonicalDirect);
      const saved: WorkspaceModuleId[] = [];
      const submitted: WorkspaceModuleId[] = [];
      const failed: { module: WorkspaceModuleId; message: string }[] = [];
      setSaving(true);
      try {
        for (const module of plan.writable) {
          try {
            await mutation.mutateAsync(buildSaveArg(module, draft, permissions));
            saved.push(module);
          } catch (err) {
            failed.push({ module, message: err instanceof Error ? err.message : 'Échec de sauvegarde.' });
          }
        }
        for (const module of plan.proposals) {
          try {
            await submitPendingChange(buildContributorSubmission(objectId, module, baseline, draft));
            submitted.push(module);
          } catch (err) {
            failed.push({ module, message: err instanceof Error ? err.message : 'Échec de la soumission.' });
          }
        }
      } finally {
        setSaving(false);
      }
      return { saved, submitted, failed, blocked: plan.blocked };
    },
    [mutation, objectId],
  );

  return { save, saving };
}
