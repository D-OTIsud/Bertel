import { useCallback, useState } from 'react';
import {
  useSaveObjectWorkspaceModuleMutation,
  type SaveWorkspaceModuleInput,
} from '../../hooks/useExplorerQueries';
import type { ObjectWorkspacePermissions, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { MODULE_KEY_MAP } from './editor-state';

export interface SaveBatchPlan {
  writable: WorkspaceModuleId[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
}

/**
 * Pure: split the dirty modules into those that can be sent (direct write, or
 * routed to the moderation proposal flow) and those blocked by permissions.
 */
export function planSaveBatch(
  dirtyModules: WorkspaceModuleId[],
  permissions: ObjectWorkspacePermissions,
): SaveBatchPlan {
  const writable: WorkspaceModuleId[] = [];
  const blocked: { module: WorkspaceModuleId; reason: string }[] = [];
  for (const module of dirtyModules) {
    const access = permissions[MODULE_KEY_MAP[module]];
    if (access?.canDirectWrite || access?.canPrepareProposal) {
      writable.push(module);
    } else {
      blocked.push({ module, reason: access?.disabledReason ?? 'Lecture seule' });
    }
  }
  return { writable, blocked };
}

export interface EditorSaveResult {
  saved: WorkspaceModuleId[];
  failed: { module: WorkspaceModuleId; message: string }[];
  blocked: { module: WorkspaceModuleId; reason: string }[];
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
 * Batched global save: persists every dirty, writable module via the existing
 * per-module RPC. Partial success is supported — a failed module keeps its
 * error and stays dirty while the others commit.
 */
export function useEditorSave(objectId: string) {
  const mutation = useSaveObjectWorkspaceModuleMutation(objectId);
  const [saving, setSaving] = useState(false);

  const save = useCallback(
    async (
      dirtyModules: WorkspaceModuleId[],
      permissions: ObjectWorkspacePermissions,
      draft: ObjectWorkspaceModules,
    ): Promise<EditorSaveResult> => {
      const plan = planSaveBatch(dirtyModules, permissions);
      const saved: WorkspaceModuleId[] = [];
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
      } finally {
        setSaving(false);
      }
      return { saved, failed, blocked: plan.blocked };
    },
    [mutation],
  );

  return { save, saving };
}
