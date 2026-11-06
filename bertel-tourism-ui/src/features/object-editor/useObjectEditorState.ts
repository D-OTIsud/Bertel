import type { WorkspaceSaveResult } from '../../services/workspace-save-result';
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

function readLocalDraft(userId: string, objectId: string, currentModules: ObjectWorkspaceModules): { baseline: ObjectWorkspaceModules; draft: ObjectWorkspaceModules; recoveryConflicts: string[] } | null {
  try {
    const raw = window.localStorage.getItem(localDraftKey(userId, objectId));
    if (!raw) return null;
    const record = JSON.parse(raw) as Record<string, unknown>;
    if (record.schemaVersion !== LOCAL_DRAFT_SCHEMA || record.objectId !== objectId
      || !isModuleSnapshot(record.baseline, currentModules) || !isModuleSnapshot(record.draft, currentModules)) return null;
    const recoveryConflicts = Array.isArray(record.recoveryConflicts) ? [...new Set(record.recoveryConflicts.filter((path): path is string =>
      typeof path === 'string' && Object.keys(currentModules).some((key) => path === key || path.startsWith(`${key}.`) || path.startsWith(`${key}[`)),
    ))] : [];
    return { baseline: record.baseline, draft: record.draft, recoveryConflicts };
  } catch { return null; }
}

/**
 * Owns the editor's mutable `{ baseline, draft }` snapshot of a workspace's
 * modules. Sections read their slice from `draft` and write through the typed
 * updaters; `dirtySections` drives the save bar; `commitModules` folds saved
 * modules' sent snapshots back into the baseline while retaining later edits.
 */
export interface EditorCommitOptions {
  canonicalRooms?: boolean;
  canonicalPlaces?: boolean;
  canonicalModules?: WorkspaceSaveResult;
  /** Exact snapshot handed to an asynchronous writer or proposal submission. */
  sentModules?: ObjectWorkspaceModules;
  /** The publication proposal carries only this setting, not the full identity module. */
  publicationSettingsOnly?: boolean;
}

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
  mergeSavedModule: <K extends keyof ObjectWorkspaceModules>(key: K, update: (current: ObjectWorkspaceModules[K]) => ObjectWorkspaceModules[K]) => void;
  commitModules: (keys: (keyof ObjectWorkspaceModules)[], options?: EditorCommitOptions) => void;
  /** Explicit post-restore read; ordinary background refetches never call this. */
  adoptRestoredModules: (modules: ObjectWorkspaceModules) => void;
  /** Accept the retained local side of recovery conflicts; saving remains a separate action. */
  keepRecoveredDraft: () => void;
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

/** Give the existing three-way merge a media-only identity, including confirmed new UUIDs. */
function rebaseSavedMedia(sent: ObjectWorkspaceModules['media'], local: ObjectWorkspaceModules['media'], saved: ObjectWorkspaceModules['media']) {
  const created = sent.galleryWriteBaseline?.createdIds ?? {};
  const confirmed = new Set(saved.objectItems.map(item => item.id));
  const keyed = (media: ObjectWorkspaceModules['media']) => ({ ...media, objectItems: media.objectItems.map(item => {
    const id = created[item.id] && confirmed.has(created[item.id]) ? created[item.id] : item.id;
    return { ...item, id, recordId: id };
  }) });
  const merged = mergeDraftAgainstServer(keyed(sent), keyed(local), keyed(saved)).value;
  return { ...merged, objectItems: merged.objectItems.map(({ recordId: _mergeIdentity, ...item }) => {
    void _mergeIdentity;
    return item;
  }) };
}

/** Child acknowledgements confirm IDs, not a new server ordering or field values. */
function rebaseSavedChildren<T>(local: T, saved: T, knownKey: 'knownRoomIds' | 'knownPlaceIds'): T {
  type ChildModule = { items: Array<Record<string, unknown>>; knownRoomIds?: string[]; knownPlaceIds?: string[] };
  const current = local as unknown as ChildModule;
  const confirmed = saved as unknown as ChildModule;
  if (!Array.isArray(current?.items) || !Array.isArray(confirmed?.items)) return local;
  const id = (item: Record<string, unknown>) => typeof item.recordId === 'string' && item.recordId ? item.recordId
    : typeof item.uid === 'string' && item.uid ? item.uid : null;
  const byId = new Map(confirmed.items.filter((item) => id(item) !== null).map((item) => [id(item), item]));
  return {
    ...local,
    [knownKey]: confirmed[knownKey],
    items: current.items.map((item) => {
      const record = byId.get(id(item));
      return record ? { ...item, recordId: record.recordId, isNew: false } : item;
    }),
  };
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
      conflicts = [...new Set([...stored.recoveryConflicts, ...merged.conflicts])];
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
      if (!isDirty && editorState.recoveryConflicts.length === 0) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, JSON.stringify({
        schemaVersion: LOCAL_DRAFT_SCHEMA,
        objectId,
        baseline: stripCatalogOptions(snapshot.baseline),
        draft: stripCatalogOptions(snapshot.draft),
        recoveryConflicts: editorState.recoveryConflicts,
        savedAt: new Date().toISOString(),
      }));
    } catch { /* local storage can be unavailable or full; editing remains available */ }
  }, [identityKey, objectId, snapshot, userId, hydratedKey, stateMatchesIdentity, editorState.recoveryConflicts]);

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

  const commitModules = useCallback((keys: (keyof ObjectWorkspaceModules)[], options?: EditorCommitOptions) => {
    setEditorState((prev) => {
      // A completed request from another object/account must not reactivate it.
      if (prev.identityKey !== identityKey) return prev;
      const current = prev.snapshot;
      const baseline = { ...current.baseline };
      let draft = current.draft;
      const sent = options?.sentModules ?? current.draft;
      const acknowledged = cloneModules(sent);
      const canonicalChildren = new Set<keyof ObjectWorkspaceModules>();
      if (options?.canonicalRooms) {
        for (const key of ['rooms', 'meetingRooms'] as const) {
          if (!keys.includes(key)) continue;
          const rooms = acknowledged[key] as unknown as { items?: Array<Record<string, unknown>>; knownRoomIds?: string[] };
          if (rooms && Array.isArray(rooms.items)) {
            rooms.knownRoomIds = rooms.items
              .map((item) => typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : '')
              .filter(Boolean);
            rooms.items = rooms.items.map((item) => ({
              ...item,
              recordId: typeof item.recordId === 'string' ? item.recordId : typeof item.uid === 'string' ? item.uid : item.recordId,
              isNew: false,
            }));
            canonicalChildren.add(key);
          }
        }
      }
      if (options?.canonicalPlaces && keys.includes('places')) {
        const places = acknowledged.places as unknown as { items?: Array<Record<string, unknown>>; knownPlaceIds?: string[] };
        if (places && Array.isArray(places.items)) {
          places.knownPlaceIds = places.items
            .map((item) => typeof item.recordId === 'string' ? item.recordId : '')
            .filter(Boolean);
          places.items = places.items.map((item) => ({ ...item, isNew: false }));
          canonicalChildren.add('places');
        }
      }
      for (const key of keys) {
        if (key === 'generalInfo' && options?.publicationSettingsOnly) {
          baseline.generalInfo = { ...baseline.generalInfo, commercialVisibility: acknowledged.generalInfo.commercialVisibility };
        } else {
          copyModule(baseline, acknowledged, key);
        }
        if (canonicalChildren.has(key)) {
          // Only records actually sent become canonical. Preserve later edits,
          // additions and deletions while carrying the confirmed IDs forward.
          draft = { ...draft, [key]: rebaseSavedChildren(current.draft[key], acknowledged[key], key === 'places' ? 'knownPlaceIds' : 'knownRoomIds') };
        }
      }
      const media = options?.canonicalModules?.media;
      if (keys.includes('media') && media) {
        baseline.media = media;
        draft = { ...draft, media: rebaseSavedMedia(sent.media, current.draft.media, media) };
      }
      return { ...prev, identityKey, snapshot: { ...current, baseline, draft }, recoveryConflicts: prev.identityKey === identityKey ? prev.recoveryConflicts : [] };
    });
  }, [identityKey]);

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
  // This updater reads the matching current state, not the server snapshot.
  // Keep its identity stable when a refetch only supplies a new gallery readId.
  }, [identityKey]);

  const adoptRestoredModules = useCallback((restored: ObjectWorkspaceModules) => {
    setEditorState((prev) => {
      if (prev.identityKey !== identityKey) return prev;
      const current = prev.snapshot;
      // Match rpc_restore_object_version's exposed canonical fields. In particular,
      // restoration does not replace status, media/CAS, prices or opening hours.
      const restoredInfo = {
        ...current.baseline.generalInfo,
        name: restored.generalInfo.name,
        nameTranslations: { ...restored.generalInfo.nameTranslations },
        businessTimezone: restored.generalInfo.businessTimezone,
        commercialVisibility: restored.generalInfo.commercialVisibility,
        regionCode: restored.generalInfo.regionCode,
        secondaryTypes: [...restored.generalInfo.secondaryTypes],
      };
      const merged = mergeDraftAgainstServer(
        { generalInfo: current.baseline.generalInfo },
        { generalInfo: current.draft.generalInfo },
        { generalInfo: restoredInfo },
      );
      return { ...prev, snapshot: { ...current,
        baseline: { ...current.baseline, generalInfo: restoredInfo },
        draft: { ...current.draft, generalInfo: merged.value.generalInfo },
      }, recoveryConflicts: [...new Set([...prev.recoveryConflicts, ...merged.conflicts])] };
    });
  }, [identityKey]);

  const keepRecoveredDraft = useCallback(() => {
    setEditorState((prev) => prev.identityKey !== identityKey ? prev : { ...prev, recoveryConflicts: [] });
  }, [identityKey]);

  const setSavedStatus = useCallback((status: string) => {
    setEditorState((prev) => {
      if (prev.identityKey !== identityKey) return prev;
      const current = prev.snapshot;
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
  }, [identityKey]);

  const dirtySections = useMemo(() => getDirtySections(snapshot, nonApplicableModules), [snapshot, nonApplicableModules]);
  const isDirty = useMemo(() => Object.values(dirtySections).some(Boolean), [dirtySections]);

  return { objectId: snapshot.objectId, draft: snapshot.draft, baseline: snapshot.baseline, dirtySections, isDirty, recoveryConflicts, patchModule, replaceModule, resetModule, commitModules, mergeSavedModule, adoptRestoredModules, keepRecoveredDraft, setSavedStatus };
}
