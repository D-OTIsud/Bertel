import { useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  invalidateObjectWorkspaceCaches,
  saveWorkspaceModule,
  type SaveWorkspaceModuleInput,
} from '../../hooks/useExplorerQueries';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { submitPendingChange } from '../../services/moderation';
import { pingNotifyDrain } from '../../services/notification-delivery';
import { workspaceSaveBlockedReason } from '../../services/object-workspace-safety';
import { MODULE_KEY_MAP } from './editor-state';
import { buildContributorSubmission } from './contributor-proposal';
import { readWriteCompatibility, type WriteCompatibility } from '../../services/write-compatibility';
import { useSessionStore } from '../../store/session-store';

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
 * A missing or degraded module is blocked before either write path, including moderation.
 * When `canWriteCanonicalDirect` is false, every remaining dirty module is routed to a proposal
 * (the backend `user_can_write_object_canonical` gate is the real security on apply). When
 * the caller IS a canonical writer, the historical per-module split applies (direct write when the
 * module is directly writable or proposal-preparable, otherwise blocked).
 */
export function planSaveBatch(
  dirtyModules: WorkspaceModuleId[],
  permissions: ObjectWorkspacePermissions,
  canWriteCanonicalDirect = true,
  draft?: ObjectWorkspaceModules,
  baseline?: ObjectWorkspaceModules,
): SaveBatchPlan {
  const writable: WorkspaceModuleId[] = [];
  const proposals: WorkspaceModuleId[] = [];
  const blocked: { module: WorkspaceModuleId; reason: string }[] = [];

  for (const module of dirtyModules) {
    const key = MODULE_KEY_MAP[module];
    const unavailable = workspaceSaveBlockedReason(module, draft?.[key])
      ?? (baseline ? workspaceSaveBlockedReason(module, baseline[key]) : null);
    if (unavailable) {
      blocked.push({ module, reason: unavailable });
      continue;
    }
    if (!canWriteCanonicalDirect) {
      // Contributor: only safely loaded edits become proposals, regardless of permission flags.
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
 *
 * The modules of a batch save IN PARALLEL: each module writes its own tables (the only shared
 * RPC, `save_object_commercial`, receives disjoint payload keys from §07 and §13), so the batch
 * costs one round-trip of wall-clock instead of N sequential ones. The caches refresh ONCE at
 * the end, fire-and-forget — the old per-module await of the full workspace refetch was the
 * main save latency, and the editor snapshot (init-once) never consumes that refetch.
 */
export function useEditorSave(objectId: string) {
  const queryClient = useQueryClient();
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
      const plan = planSaveBatch(dirtyModules, permissions, canWriteCanonicalDirect, draft, baseline);
      const saved: WorkspaceModuleId[] = [];
      const submitted: WorkspaceModuleId[] = [];
      const failed: { module: WorkspaceModuleId; message: string }[] = [];
      setSaving(true);
      try {
        let compatibility: WriteCompatibility | undefined;
        if (!useSessionStore.getState().demoMode && (plan.writable.length > 0 || plan.proposals.length > 0)) {
          compatibility = await readWriteCompatibility();
          if (!compatibility.compatible) {
            const reason = compatibility.reason ?? 'Écriture bloquée : vérification de compatibilité impossible.';
            return {
              saved,
              submitted,
              failed: [...plan.writable, ...plan.proposals].map((module) => ({ module, message: reason })),
              blocked: plan.blocked,
            };
          }
        }
        const writes = await Promise.allSettled(
          plan.writable.map((module) => saveWorkspaceModule(objectId, buildSaveArg(module, draft, permissions), compatibility)),
        );
        writes.forEach((result, index) => {
          const module = plan.writable[index];
          if (result.status === 'fulfilled') {
            saved.push(module);
          } else {
            failed.push({
              module,
              message: result.reason instanceof Error ? result.reason.message : 'Échec de sauvegarde.',
            });
          }
        });

        const submissions = await Promise.allSettled(
          plan.proposals.map((module) => submitPendingChange(buildContributorSubmission(objectId, module, baseline, draft))),
        );
        submissions.forEach((result, index) => {
          const module = plan.proposals[index];
          if (result.status === 'fulfilled') {
            submitted.push(module);
          } else {
            failed.push({
              module,
              message: result.reason instanceof Error ? result.reason.message : 'Échec de la soumission.',
            });
          }
        });
      } finally {
        setSaving(false);
      }
      // Proposals don't touch the object's rows — only direct writes need the cache refresh.
      if (saved.length > 0) {
        invalidateObjectWorkspaceCaches(queryClient, objectId);
      }
      if (submitted.length > 0) {
        void queryClient.invalidateQueries({ queryKey: ['pending-changes'] });
        // Preserve the deployed one-shot notification for a settled proposal batch.
        void pingNotifyDrain();
      }
      return { saved, submitted, failed, blocked: plan.blocked };
    },
    [queryClient, objectId],
  );

  return { save, saving };
}
