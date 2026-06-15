import { useCallback, useMemo, useState } from 'react';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import { cloneModules, getDirtySections, type EditorSnapshot } from './editor-state';

/**
 * Owns the editor's mutable `{ baseline, draft }` snapshot of a workspace's
 * modules. Sections read their slice from `draft` and write through the typed
 * updaters; `dirtySections` drives the save bar; `commitModules` folds saved
 * modules back into the baseline so they read clean.
 */
export interface ObjectEditorState {
  /** Canonical object id this editor edits (for per-object routes like uploads). */
  objectId: string;
  draft: ObjectWorkspaceModules;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  isDirty: boolean;
  patchModule: <K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => void;
  replaceModule: <K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => void;
  resetModule: (key: keyof ObjectWorkspaceModules) => void;
  commitModules: (keys: (keyof ObjectWorkspaceModules)[]) => void;
  /** Sets object.status in BOTH draft and baseline (the new saved truth) without
   *  touching other fields — used after a successful status-lifecycle mutation so
   *  the UI reflects the change without a refetch (the snapshot is init-once). */
  setSavedStatus: (status: string) => void;
}

/** Copies one module slice between snapshots; the generic key keeps it type-safe. */
function copyModule<K extends keyof ObjectWorkspaceModules>(
  target: ObjectWorkspaceModules,
  source: ObjectWorkspaceModules,
  key: K,
): void {
  target[key] = source[key];
}

export function useObjectEditorState(objectId: string, modules: ObjectWorkspaceModules): ObjectEditorState {
  const [snapshot, setSnapshot] = useState<EditorSnapshot>(() => ({
    objectId,
    baseline: cloneModules(modules),
    draft: cloneModules(modules),
  }));

  const replaceModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: value } }));
  }, []);

  const patchModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: { ...prev.draft[key], ...patch } } }));
  }, []);

  const resetModule = useCallback((key: keyof ObjectWorkspaceModules) => {
    setSnapshot((prev) => ({ ...prev, draft: { ...prev.draft, [key]: cloneModules(prev.baseline)[key] } }));
  }, []);

  const commitModules = useCallback((keys: (keyof ObjectWorkspaceModules)[]) => {
    setSnapshot((prev) => {
      const baseline = { ...prev.baseline };
      const draftClone = cloneModules(prev.draft);
      for (const key of keys) {
        copyModule(baseline, draftClone, key);
      }
      return { ...prev, baseline };
    });
  }, []);

  const setSavedStatus = useCallback((status: string) => {
    setSnapshot((prev) => ({
      ...prev,
      baseline: {
        ...prev.baseline,
        generalInfo: { ...prev.baseline.generalInfo, status },
        publication: { ...prev.baseline.publication, status },
      },
      draft: {
        ...prev.draft,
        generalInfo: { ...prev.draft.generalInfo, status },
        publication: { ...prev.draft.publication, status },
      },
    }));
  }, []);

  const dirtySections = useMemo(() => getDirtySections(snapshot), [snapshot]);
  const isDirty = useMemo(() => Object.values(dirtySections).some(Boolean), [dirtySections]);

  return { objectId: snapshot.objectId, draft: snapshot.draft, dirtySections, isDirty, patchModule, replaceModule, resetModule, commitModules, setSavedStatus };
}
