import { isPlainRecord as isRecord } from '../../lib/json-read';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import type { WorkspaceModuleId } from '../../services/object-workspace';
import { cloneModules, getDirtySections, MODULE_KEY_MAP, type EditorSnapshot } from './editor-state';
import { mergeDraftAgainstServer } from './draft-recovery';
import { restoreCatalogOptions, stripCatalogOptions } from './io/object-io-serialize';

const LOCAL_DRAFT_SCHEMA = 1;
const NO_EXCLUDED_MODULES: readonly WorkspaceModuleId[] = [];
function localDraftKey(userId: string, objectId: string): string {
  return `object-editor-draft:${encodeURIComponent(userId)}:${encodeURIComponent(objectId)}`;
}

function isModuleSnapshot(value: unknown, currentModules: ObjectWorkspaceModules): value is ObjectWorkspaceModules {
  if (!isRecord(value)) return false;
  return Object.keys(currentModules).every((key) => {
    const storedModule = value[key];
    const currentModule = currentModules[key as keyof ObjectWorkspaceModules];
    if (!isRecord(storedModule) || !isRecord(currentModule)) return false;
    return Object.keys(currentModule).every((field) => !Array.isArray(currentModule[field]) || Array.isArray(storedModule[field]));
  });
}

function readLocalDraft(userId: string, objectId: string, currentModules: ObjectWorkspaceModules): { baseline: ObjectWorkspaceModules; draft: ObjectWorkspaceModules } | null {
  try {
    const raw = window.localStorage.getItem(localDraftKey(userId, objectId));
    if (!raw) return null;
    const record = JSON.parse(raw) as Record<string, unknown>;
    if (record.schemaVersion !== LOCAL_DRAFT_SCHEMA || record.objectId !== objectId
      || !isModuleSnapshot(record.baseline, currentModules) || !isModuleSnapshot(record.draft, currentModules)) return null;
    return { baseline: record.baseline, draft: record.draft };
  } catch { return null; }
}

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
  /** Last-saved snapshot (P1.3 — source of the before/after diff on contributor proposals). */
  baseline: ObjectWorkspaceModules;
  dirtySections: Partial<Record<WorkspaceModuleId, boolean>>;
  isDirty: boolean;
  recoveryConflicts: string[];
  patchModule: <K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => void;
  replaceModule: <K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => void;
  resetModule: (key: keyof ObjectWorkspaceModules) => void;
  commitModules: (keys: (keyof ObjectWorkspaceModules)[], options?: { canonicalRooms?: boolean; canonicalPlaces?: boolean }) => void;
  /** Rebase only the fields confirmed by the server, retaining other local edits. Updater must be pure. */
  mergeSavedModule: <K extends keyof ObjectWorkspaceModules>(key: K, update: (current: ObjectWorkspaceModules[K]) => ObjectWorkspaceModules[K]) => void;
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

export function useObjectEditorState(
  objectId: string,
  modules: ObjectWorkspaceModules,
  userId: string | null = null,
  nonApplicableModules: readonly WorkspaceModuleId[] = NO_EXCLUDED_MODULES,
): ObjectEditorState {
  const identityKey = JSON.stringify([objectId, userId]);
  const freshSnapshot = useMemo<EditorSnapshot>(() => ({
    objectId,
    baseline: cloneModules(modules),
    draft: cloneModules(modules),
  }), [objectId, userId, modules]);
  const [editorState, setEditorState] = useState<{
    identityKey: string;
    snapshot: EditorSnapshot;
    recoveryConflicts: string[];
  }>(() => ({ identityKey, snapshot: freshSnapshot, recoveryConflicts: [] }));
  const stateMatchesIdentity = editorState.identityKey === identityKey;
  // Do not render the previous account's in-memory draft for even one committed render
  // while the account-change effect is waiting to hydrate the next identity.
  const snapshot = stateMatchesIdentity ? editorState.snapshot : freshSnapshot;
  const nonApplicableKeys = nonApplicableModules.map((module) => MODULE_KEY_MAP[module]);
  const recoveryConflicts = stateMatchesIdentity ? editorState.recoveryConflicts.filter((path) =>
    !nonApplicableKeys.some((key) => path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`)),
  ) : [];
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    setHydratedKey(null);
    let recoveredSnapshot = freshSnapshot;
    let conflicts: string[] = [];
    const stored = userId ? readLocalDraft(userId, objectId, modules) : null;
    if (stored) {
      const cleanBase = stripCatalogOptions(modules);
      const merged = mergeDraftAgainstServer(stored.baseline, stored.draft, cleanBase);
      // The helper restores ONE module. Restoring the whole workspace left every nested
      // catalog empty, so untouched sections became dirty after recovering a draft.
      const restored = Object.fromEntries(Object.entries(modules).map(([key, module]) => [
        key, restoreCatalogOptions(merged.value[key as keyof ObjectWorkspaceModules], module, key),
      ])) as unknown as ObjectWorkspaceModules;
      recoveredSnapshot = { objectId, baseline: cloneModules(modules), draft: restored };
      conflicts = merged.conflicts;
    }
    setEditorState({ identityKey, snapshot: recoveredSnapshot, recoveryConflicts: conflicts });
    setHydratedKey(identityKey);
  // The hook is mounted per object; modules are the fresh server snapshot for that mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [objectId, userId]);

  useEffect(() => {
    if (!userId || hydratedKey !== identityKey || !stateMatchesIdentity) return;
    try {
      // Retain edits to a now-inapplicable module in local recovery storage, while the
      // visible dirty/save state below excludes it. No hidden draft data is discarded.
      const isDirty = Object.values(getDirtySections(snapshot)).some(Boolean);
      const key = localDraftKey(userId, objectId);
      if (!isDirty) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify({
        schemaVersion: LOCAL_DRAFT_SCHEMA,
        objectId,
        baseline: stripCatalogOptions(snapshot.baseline),
        draft: stripCatalogOptions(snapshot.draft),
        savedAt: new Date().toISOString(),
      }));
    } catch { /* local storage can be unavailable or full; editing remains available */ }
  }, [identityKey, objectId, snapshot, userId, hydratedKey, stateMatchesIdentity]);

  const replaceModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, value: ObjectWorkspaceModules[K]) => {
    setEditorState((prev) => {
      const current = prev.identityKey === identityKey ? prev.snapshot : freshSnapshot;
      return { ...prev, identityKey, snapshot: { ...current, draft: { ...current.draft, [key]: value } }, recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [] };
    });
  }, [freshSnapshot, identityKey]);

  const patchModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, patch: Partial<ObjectWorkspaceModules[K]>) => {
    setEditorState((prev) => {
      const current = prev.identityKey === identityKey ? prev.snapshot : freshSnapshot;
      return { ...prev, identityKey, snapshot: { ...current, draft: { ...current.draft, [key]: { ...current.draft[key], ...patch } } }, recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [] };
    });
  }, [freshSnapshot, identityKey]);

  const resetModule = useCallback((key: keyof ObjectWorkspaceModules) => {
    setEditorState((prev) => {
      const current = prev.identityKey === identityKey ? prev.snapshot : freshSnapshot;
      const conflicts = prev.identityKey === identityKey ? prev.recoveryConflicts : [];
      return {
        identityKey,
        snapshot: { ...current, draft: { ...current.draft, [key]: cloneModules(current.baseline)[key] } },
        recoveryConflicts: conflicts.filter((path) => path !== key && !path.startsWith(`${key}.`) && !path.startsWith(`${key}[`)),
      };
    });
  }, [freshSnapshot, identityKey]);

  const commitModules = useCallback((keys: (keyof ObjectWorkspaceModules)[], options?: { canonicalRooms?: boolean; canonicalPlaces?: boolean }) => {
    setEditorState((prev) => {
      const current = prev.identityKey === identityKey ? prev.snapshot : freshSnapshot;
      const baseline = { ...current.baseline };
      let draft = current.draft;
      let canonicalModuleUpdated = false;
      const draftClone = cloneModules(current.draft);
      for (const key of keys) {
        copyModule(baseline, draftClone, key);
      }
      if (options?.canonicalRooms) {
        if (keys.includes('rooms')) {
          const rooms = draftClone.rooms as unknown as { items?: Array<Record<string, unknown>>; knownRoomIds?: string[] };
          if (rooms && Array.isArray(rooms.items)) {
            rooms.knownRoomIds = rooms.items
              .map((item) => typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : '')
              .filter(Boolean);
            rooms.items = rooms.items.map((item) => ({
              ...item,
              recordId: typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : item.recordId,
              isNew: false,
            }));
            baseline.rooms = rooms as unknown as typeof baseline.rooms;
            draftClone.rooms = rooms as unknown as typeof draftClone.rooms;
            canonicalModuleUpdated = true;
          }
        }
        if (keys.includes('meetingRooms')) {
          const rooms = draftClone.meetingRooms as unknown as { items?: Array<Record<string, unknown>>; knownRoomIds?: string[] };
          if (rooms && Array.isArray(rooms.items)) {
            rooms.knownRoomIds = rooms.items
              .map((item) => typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : '')
              .filter(Boolean);
            rooms.items = rooms.items.map((item) => ({
              ...item,
              recordId: typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : item.recordId,
              isNew: false,
            }));
            baseline.meetingRooms = rooms as unknown as typeof baseline.meetingRooms;
            draftClone.meetingRooms = rooms as unknown as typeof draftClone.meetingRooms;
            canonicalModuleUpdated = true;
          }
        }
      }
      if (options?.canonicalPlaces && keys.includes('places')) {
        const places = draftClone.places as unknown as { items?: Array<Record<string, unknown>>; knownPlaceIds?: string[] };
        if (places && Array.isArray(places.items)) {
          places.knownPlaceIds = places.items
            .map((item) => typeof item.recordId === 'string' ? item.recordId : '')
            .filter(Boolean);
          places.items = places.items.map((item) => ({ ...item, isNew: false }));
          baseline.places = places as unknown as typeof baseline.places;
          draftClone.places = places as unknown as typeof draftClone.places;
          canonicalModuleUpdated = true;
        }
      }
      if (canonicalModuleUpdated) draft = draftClone;
      return { ...prev, identityKey, snapshot: { ...current, baseline, draft }, recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [] };
    });
  }, [freshSnapshot, identityKey]);

  const mergeSavedModule = useCallback(<K extends keyof ObjectWorkspaceModules>(key: K, update: (current: ObjectWorkspaceModules[K]) => ObjectWorkspaceModules[K]) => {
    setEditorState((prev) => {
      // Une réponse d’une ancienne fiche/session ne doit pas réactiver son état.
      if (prev.identityKey !== identityKey) return prev;
      const current = prev.snapshot;
      return { ...prev, identityKey, snapshot: { ...current,
        baseline: { ...current.baseline, [key]: update(current.baseline[key]) },
        draft: { ...current.draft, [key]: update(current.draft[key]) },
      }, recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [] };
    });
  }, [freshSnapshot, identityKey]);

  const setSavedStatus = useCallback((status: string) => {
    setEditorState((prev) => {
      const current = prev.identityKey === identityKey ? prev.snapshot : freshSnapshot;
      return {
      ...prev,
      identityKey,
      snapshot: {
      ...current,
      baseline: {
        ...current.baseline,
        generalInfo: { ...current.baseline.generalInfo, status },
        publication: { ...current.baseline.publication, status },
      },
      draft: {
        ...current.draft,
        generalInfo: { ...current.draft.generalInfo, status },
        publication: { ...current.draft.publication, status },
      },
      },
      recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [],
    };
    });
  }, [freshSnapshot, identityKey]);

  const dirtySections = useMemo(() => getDirtySections(snapshot, nonApplicableModules), [snapshot, nonApplicableModules]);
  const isDirty = useMemo(() => Object.values(dirtySections).some(Boolean), [dirtySections]);

  return { objectId: snapshot.objectId, draft: snapshot.draft, baseline: snapshot.baseline, dirtySections, isDirty, recoveryConflicts, patchModule, replaceModule, resetModule, commitModules, mergeSavedModule, setSavedStatus };
}
