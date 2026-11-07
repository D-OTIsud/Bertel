'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useUiStore } from '../../store/ui-store';
import { useSessionStore } from '../../store/session-store';
import { sessionQueryScopeKey } from '../../app/session-query-cache';
import { useToast } from '../../hooks/useToast';
import { loadObjectWorkspace, useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation, useSetObjectStatusMutation, useObjectVersionsQuery, useRestoreObjectVersionMutation } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { getArchetypeMeta, type ArchetypeCode, type ArchetypeMeta, TYPE_LABEL } from './archetypes';
import { useObjectEditorState } from './useObjectEditorState';
import { useUnsavedDraftGuard } from './useUnsavedDraftGuard';
import { useEditorSave } from './useEditorSave';
import { makeSections, type SectionItem } from './section-config';
import { getDirtySections, MODULE_KEY_MAP } from './editor-state';
import {
  computeNavHint,
  computeOverallCompletion,
  computeSectionCompletions,
  type SectionCompletion,
} from './editor-completion';
import { validateForPublication, type Issue } from './editor-validation';
import { saveResultToIssues, publishErrorToIssue } from './save-issues';
import { BlockersModal } from './widgets/BlockersModal';
import { VersionHistoryModal } from './widgets/VersionHistoryModal';
import { ImportExportModal } from './widgets/ImportExportModal';
import {
  serializeObjectJson,
  serializeObjectCsv,
  parseImportedObjectJson,
  stripCatalogOptions,
  restoreCatalogOptions,
  type ObjectIoMeta,
} from './io/object-io-serialize';
import { downloadTextFile, readFileText, triggerPrint } from './io/object-io-effects';
import { getRegisteredSections, MODE_ESSENTIAL } from './sections/section-registry';
import { EditorTopbar, type EditorMode, type EditorActionFeedback } from './shell/EditorTopbar';
import { EditorNav, type EditorNavSectionState } from './shell/EditorNav';
import { EditorRail } from './shell/EditorRail';
import { useEditorPresence } from './presence/useEditorPresence';
import { SectionPresenceBadge } from './widgets/SectionPresenceBadge';
import { PeerSavedBanner } from './widgets/PeerSavedBanner';
import { ConfirmDialog } from './primitives';
import { EditorModalContext } from './primitives/EditorModal';
import { buildEditorTools, archiveTargetStatus, type EditorToolKey } from './shell/editor-tools';
import type { HistoryRailItem } from './widgets/HistoryRail';
import { useEditorScrollSpy } from './useEditorScrollSpy';
import './object-editor.css';
import './editor-print.css';
import { strictErrorMessage } from '../../lib/strict-error-message';

/** Compare editable content, not a refreshed catalog or the gallery CAS/read token. */
function changedSinceSave(
  sent: ObjectWorkspaceModules,
  current: ObjectWorkspaceModules,
  nonApplicableModules: readonly WorkspaceModuleId[] = [],
): boolean {
  const content = (modules: ObjectWorkspaceModules): ObjectWorkspaceModules => {
    const clean = stripCatalogOptions(modules);
    return clean.media ? { ...clean, media: { ...clean.media, galleryWriteBaseline: undefined } } : clean;
  };
  return Object.values(getDirtySections({
    objectId: '', baseline: content(sent), draft: content(current),
  }, nonApplicableModules)).some(Boolean);
}

/** Full-page object editor. Fetches the workspace resource, then hands off to
 *  EditorReady so the editor hooks only run once data is present. */
export function ObjectEditPage({ objectId }: { objectId: string }) {
  const read = useObjectWorkspaceQuery(objectId);
  const { isError, error, refetch, isFetching } = read;
  const userId = useSessionStore((state) => state.userId);
  const identity = JSON.stringify([objectId, userId]);
  const previous = useRef<{ identity: string; data: ObjectWorkspaceResource } | null>(null);
  if (read.data) previous.current = { identity, data: read.data };
  // A vocabulary generation changes the query key while the draft still belongs
  // to the same editor. Keep that editor mounted, including when local storage
  // is unavailable; an object/account transition never reuses this fallback.
  const data = read.data ?? (previous.current?.identity === identity ? previous.current.data : undefined);
  const loadError = isError ? (
      <div className="panel-card panel-card--warning" role="alert">
        <p>{(error as Error).message}</p>
        <button type="button" className="btn btn--ghost" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? 'Vérification…' : 'Réessayer'}
        </button>
      </div>
  ) : null;
  if (!data) {
    return loadError ?? <div className="panel-card">Chargement de l&apos;éditeur…</div>;
  }
  // §46: no silent archetype fallback — an unmapped type (ORG, or future enum values not yet
  // wired) gets an explicit unsupported panel instead of rendering as a Hébergement.
  const meta = getArchetypeMeta(data.type);
  if (!meta) {
    return (
      <div className="panel-card panel-card--warning">
        Le type d&apos;objet «{data.type ?? '?'}» n&apos;est pas pris en charge par l&apos;éditeur de fiches.
        Les organisations (ORG) se gèrent via l&apos;administration d&apos;équipe.
      </div>
    );
  }
  // Keep the editor mounted during vocabulary refresh or after a failed read:
  // its unsaved draft lives in component state. Pause editing until the current read succeeds;
  // the memory-only draft export remains available without a server read or write.
  return (
    <>
      {loadError}
      <EditorModalContext.Provider value={`${data.name} · ${data.type ? TYPE_LABEL[data.type as keyof typeof TYPE_LABEL] || data.type : meta.family}`}>
        <EditorReady resource={data} objectId={objectId} meta={meta} workspaceQueryKey={read.workspaceQueryKey} workspaceReadReady={Boolean(read.data) && !isError && !isFetching} workspaceReadFailed={isError || !read.data} />
      </EditorModalContext.Provider>
    </>
  );
}

function flattenSectionItems(groups: ReturnType<typeof makeSections>): SectionItem[] {
  return groups.flatMap((group) => group.items);
}

function sectionStateFrom(
  completions: SectionCompletion[],
  validation: { blockers: Issue[]; warnings: Issue[] },
  draft: ObjectWorkspaceModules,
  archetype: ArchetypeCode,
): Record<string, EditorNavSectionState> {
  const blockerSections = new Set(validation.blockers.map((issue) => issue.section));
  const warningSections = new Set(validation.warnings.map((issue) => issue.section));

  return Object.fromEntries(
    completions.map((completion) => {
      const status = blockerSections.has(completion.num)
        ? 'req'
        : warningSections.has(completion.num)
          ? 'warn'
          : completion.stat;
      const hint = computeNavHint(completion.num, draft, completion.pct, archetype);
      return [
        completion.num,
        {
          pct: completion.pct,
          status,
          hint: hint || (status === 'ok' && completion.pct >= 100 ? '' : `${completion.pct}%`),
        },
      ];
    }),
  );
}

function buildHistoryItems(draft: ObjectWorkspaceModules): HistoryRailItem[] {
  const items: HistoryRailItem[] = [];

  if (draft.syncIdentifiers.objectUpdatedAt) {
    items.push({
      who: draft.syncIdentifiers.objectUpdatedAtSource || 'Bertel',
      what: 'a mis à jour la fiche',
      when: draft.syncIdentifiers.objectUpdatedAt,
    });
  }

  const publishedAt = draft.publication.publishedAt || draft.generalInfo.publishedAt;
  if (publishedAt) {
    items.push({
      who: 'Publication',
      what: 'a publié ou préparé la fiche',
      when: publishedAt,
    });
  }

  for (const origin of draft.syncIdentifiers.origins.slice(0, 2)) {
    if (origin.updatedAt || origin.createdAt || origin.firstImportedAt) {
      items.push({
        who: origin.sourceSystem || 'Import',
        what: origin.sourceObjectId ? `a synchronisé ${origin.sourceObjectId}` : 'a synchronisé la fiche',
        when: origin.updatedAt || origin.createdAt || origin.firstImportedAt,
      });
    }
  }

  for (const note of draft.providerFollowUp.notes.slice(0, 2)) {
    items.push({
      who: note.createdByName || 'Équipe',
      what: `a ajouté une note ${note.category}`,
      when: note.updatedAt || note.createdAt,
    });
  }

  return items
    .filter((item) => item.when)
    .sort((left, right) => right.when.localeCompare(left.when))
    .slice(0, 5);
}

function EditorReady({ resource, objectId, meta, workspaceQueryKey, workspaceReadReady, workspaceReadFailed }: { resource: ObjectWorkspaceResource; objectId: string; meta: ArchetypeMeta; workspaceQueryKey: QueryKey; workspaceReadReady: boolean; workspaceReadFailed: boolean }) {
  const router = useRouter();
  const toast = useToast();
  const openDrawer = useUiStore((state) => state.openDrawer);
  const userId = useSessionStore((state) => state.userId);
  const editor = useObjectEditorState(objectId, resource.modules, userId, resource.nonApplicableModules);
  const latestDraft = useRef(editor.draft);
  latestDraft.current = editor.draft;
  const langPrefs = useSessionStore((state) => state.langPrefs);
  const { confirmLeave } = useUnsavedDraftGuard(editor.isDirty);
  const { save, saving } = useEditorSave(objectId);
  // P1.3 — contributor fork: a user without direct canonical write proposes changes through the
  // moderation queue instead of writing directly. The canonical-write capability is uniform across
  // every content section (canDirectCanonical == canWriteSafeWorkspaceRpc), so generalInfo is a
  // faithful page-level signal. The backend gate stays the real security; this is ergonomic only.
  const canWriteCanonicalDirect = resource.permissions.generalInfo.canDirectWrite;
  const contributorMode = !canWriteCanonicalDirect;
  const publishObject = usePublishObjectWorkspaceMutation(objectId);
  const [mode, setMode] = useState<EditorMode>('complet');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [blockersModalOpen, setBlockersModalOpen] = useState(false);
  const [modalContext, setModalContext] = useState<'publish' | 'save' | 'publish-deferred'>('publish');
  const [saveErrors, setSaveErrors] = useState<Issue[]>([]);
  const [saveFeedback, setSaveFeedback] = useState<EditorActionFeedback>('idle');
  const [publishFeedback, setPublishFeedback] = useState<EditorActionFeedback>('idle');
  const publicationGeneration = useRef(0);
  const publicationMounted = useRef(false);
  useEffect(() => {
    publicationMounted.current = true;
    publicationGeneration.current += 1;
    setPublishFeedback('idle');
    // Observe account transitions synchronously, including A -> B -> A batched
    // into one React render. Returning to A must not revive its older request.
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (next.userId !== previous.userId) {
        publicationGeneration.current += 1;
        setPublishFeedback('idle');
      }
    });
    return () => {
      unsubscribe();
      publicationMounted.current = false;
      publicationGeneration.current += 1;
    };
  }, [objectId]);
  // Independent timer refs per channel: a shared ref would let a publish flash's clearTimeout
  // cancel the save flash's pending revert-to-idle timer (or vice versa) when save→publish (or
  // the reverse) happens within the 1.2s flash window, stranding that channel on "success".
  const saveFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishFeedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (saveFeedbackTimerRef.current !== null) clearTimeout(saveFeedbackTimerRef.current);
      if (publishFeedbackTimerRef.current !== null) clearTimeout(publishFeedbackTimerRef.current);
    };
  }, []);

  /** Flash the topbar action feedback to "success" for 1.2s, then back to idle. Clears any
   *  prior pending timer on the SAME channel's ref so rapid save→save-again (or publish→
   *  publish-again) doesn't leave two competing timeouts; the unmount cleanup above guards
   *  against a setState-after-unmount during the flash. */
  function flashSuccess(
    setFeedback: (value: EditorActionFeedback) => void,
    timerRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>,
  ) {
    setFeedback('success');
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setFeedback('idle'), 1200);
  }

  const setObjectStatus = useSetObjectStatusMutation(objectId);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  // §103 — l'export OUTILS reconstruit l'objet EDITABLE COMPLET via le chargeur
  // (get_object_resource + selects directs), qui exige desormais les catalogues.
  const queryClient = useQueryClient();
  const versionsQuery = useObjectVersionsQuery(objectId);
  const restoreVersion = useRestoreObjectVersionMutation(objectId);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);
  const restoreIdentity = JSON.stringify([userId, objectId]);
  const restoreScope = useRef({ identity: restoreIdentity, generation: 0, pending: false });
  if (restoreScope.current.identity !== restoreIdentity) {
    restoreScope.current = { identity: restoreIdentity, generation: restoreScope.current.generation + 1, pending: false };
  }
  const [pendingRestore, setPendingRestore] = useState<{
    identity: string; generation: number; versionNumber: number; awaitingRead: boolean;
  } | null>(null);
  const restoring = pendingRestore !== null && pendingRestore.identity === restoreIdentity
    && pendingRestore.generation === restoreScope.current.generation;

  useEffect(() => {
    // Store notifications are synchronous even when React batches A -> B -> A
    // into one render. Returning to A must not revive A's older restoration.
    const unsubscribe = useSessionStore.subscribe((next, previous) => {
      if (next.userId !== previous.userId) {
        restoreScope.current.generation += 1;
        restoreScope.current.pending = false;
        setPendingRestore(null);
      }
    });
    return () => {
      unsubscribe();
      restoreScope.current.generation += 1;
      restoreScope.current.pending = false;
    };
  }, []);

  useEffect(() => {
    if (!restoring || !pendingRestore?.awaitingRead || !workspaceReadReady || resource.id !== objectId) return;
    const current = queryClient.getQueryState<ObjectWorkspaceResource>(workspaceQueryKey);
    // invalidateQueries can resolve before the observer delivers its fresh prop,
    // and can also resolve after a failed/paused refetch. Adopt only the exact
    // successful cache value that the page now observes, including after Retry.
    if (current?.status !== 'success' || current.fetchStatus !== 'idle' || current.isInvalidated || current.data !== resource) return;
    editor.adoptRestoredModules(resource.modules);
    restoreScope.current.pending = false;
    setVersionsModalOpen(false);
    setStatusMessage(`Version v${pendingRestore.versionNumber} restaurée — une nouvelle version a été créée.`);
    setPendingRestore(null);
  }, [restoring, pendingRestore, workspaceReadReady, workspaceQueryKey, resource, objectId, queryClient, editor.adoptRestoredModules]);

  // §E Import / export — frontend-only tool (no backend, no object creation).
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const exportScope = { objectId, userId, sessionScope: sessionQueryScopeKey(useSessionStore.getState()),
    resourceId: resource.id, editorObjectId: editor.objectId, type: resource.type ?? '', draft: editor.draft };
  const latestExportScope = useRef(exportScope);
  latestExportScope.current = exportScope;

  function handleExportLocalDraft() {
    const current = latestExportScope.current;
    const liveSession = useSessionStore.getState();
    if (!userId || liveSession.userId !== userId || current.sessionScope !== sessionQueryScopeKey(liveSession)
      || current.userId !== userId || current.objectId !== objectId
      || current.resourceId !== objectId || current.editorObjectId !== objectId) {
      setStatusMessage('Export impossible.');
      return;
    }
    try {
      const ioMeta: ObjectIoMeta = { objectId, type: current.type, name: current.draft.generalInfo.name };
      downloadTextFile(`${objectId}-brouillon.json`, 'application/json', serializeObjectJson(stripCatalogOptions(current.draft), ioMeta));
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Export impossible : ${error.message}` : 'Export impossible.');
    }
  }

  async function handleExportJson() {
    try {
      const ws = await loadObjectWorkspace(queryClient, objectId, langPrefs);
      if (editor.isDirty) {
        setStatusMessage(`Export basé sur la fiche enregistrée — vos modifications non sauvegardées n'y figurent pas.`);
      }
      const ioMeta: ObjectIoMeta = { objectId, type: ws.type ?? '', name: ws.name };
      downloadTextFile(`${objectId}.json`, 'application/json', serializeObjectJson(stripCatalogOptions(ws.modules), ioMeta));
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Export impossible : ${error.message}` : 'Export impossible.');
    }
  }

  async function handleExportCsv() {
    try {
      const ws = await loadObjectWorkspace(queryClient, objectId, langPrefs);
      const ioMeta: ObjectIoMeta = { objectId, type: ws.type ?? '', name: ws.name };
      downloadTextFile(`${objectId}.csv`, 'text/csv', serializeObjectCsv(ws.modules, ioMeta));
    } catch (error) {
      setStatusMessage(error instanceof Error ? `Export impossible : ${error.message}` : 'Export impossible.');
    }
  }

  function handleExportPdf() {
    // Close the modal first so the @media print rule (which prints only .edit-main) sees no dialog.
    setImportExportOpen(false);
    // Defer to the next frame so the dialog has unmounted before the print dialog opens.
    requestAnimationFrame(() => triggerPrint());
  }

  async function handleImportFile(file: File) {
    setImportError(null);
    let raw: string;
    try {
      raw = await readFileText(file);
    } catch {
      setImportError('Le fichier n’a pas pu être lu.');
      return;
    }
    const result = parseImportedObjectJson(raw);
    if (!result.ok) {
      setImportError(result.error);
      return;
    }
    // Apply each known module onto the draft — replaceModule marks it dirty by snapshot diff.
    // restoreCatalogOptions keeps the live draft's reference catalogs so a v2 export (catalogs
    // stripped) doesn't blank the dropdowns; file data still wins. A v1 file keeps its catalogs.
    for (const [key, value] of Object.entries(result.modules)) {
      const moduleKey = key as keyof typeof editor.draft;
      editor.replaceModule(
        moduleKey,
        restoreCatalogOptions(value, editor.draft[moduleKey], moduleKey as string) as (typeof editor.draft)[keyof typeof editor.draft],
      );
    }
    setImportExportOpen(false);
    setStatusMessage('Fiche importée dans le brouillon — relisez puis enregistrez.');
  }

  // Real current version = the highest version_number from the history (the parser does not expose
  // object.current_version). null while loading ⇒ the nav badge stays "Bientôt disponible" (no fake v12).
  const currentVersion =
    versionsQuery.data && versionsQuery.data.length > 0
      ? Math.max(...versionsQuery.data.map((v) => v.versionNumber))
      : null;

  async function handleRestoreVersion(versionNumber: number) {
    if (restoreScope.current.pending || saving || savingDraft || publishObject.isPending) return;
    const attempt = { identity: restoreIdentity, generation: ++restoreScope.current.generation, versionNumber, awaitingRead: false };
    restoreScope.current.pending = true;
    setPendingRestore(attempt);
    const isCurrent = () => restoreScope.current.identity === attempt.identity && restoreScope.current.generation === attempt.generation;
    try {
      await restoreVersion.mutateAsync(versionNumber);
      if (isCurrent()) setPendingRestore({ ...attempt, awaitingRead: true });
    } catch (error) {
      if (isCurrent()) {
        restoreScope.current.pending = false;
        setPendingRestore(null);
        setStatusMessage(strictErrorMessage(error, 'Restauration impossible.'));
      }
    }
  }

  const lifecycleStatus = editor.draft.generalInfo.status || editor.draft.publication.status || 'draft';
  const lifecyclePublishedAt = editor.draft.publication.publishedAt || editor.draft.generalInfo.publishedAt || '';
  const isArchived = lifecycleStatus === 'archived';

  const editorTools = useMemo(
    () =>
      buildEditorTools({
        status: lifecycleStatus,
        canArchive: resource.permissions.publication.canDirectWrite,
        archiveDisabledReason: resource.permissions.publication.disabledReason,
        currentVersion,
      }),
    [lifecycleStatus, resource.permissions.publication.canDirectWrite, resource.permissions.publication.disabledReason, currentVersion],
  );

  function handleToolSelect(key: EditorToolKey) {
    if (key === 'archive') {
      setArchiveConfirmOpen(true);
    } else if (key === 'versions') {
      setVersionsModalOpen(true);
    } else if (key === 'import-export') {
      setImportError(null);
      setImportExportOpen(true);
    }
  }

  async function handleArchiveConfirm() {
    const target = archiveTargetStatus(lifecycleStatus, lifecyclePublishedAt);
    try {
      await setObjectStatus.mutateAsync(target);
      editor.setSavedStatus(target);
      setArchiveConfirmOpen(false);
      setStatusMessage(isArchived ? 'Fiche restaurée.' : 'Fiche archivée.');
    } catch (error) {
      setArchiveConfirmOpen(false);
      setStatusMessage(strictErrorMessage(error, 'Changement de statut impossible.'));
    }
  }

  const groups = useMemo(() => makeSections(meta.archetype), [meta.archetype]);
  const navItems = useMemo(() => flattenSectionItems(groups), [groups]);
  const sections = useMemo(() => getRegisteredSections(meta.archetype), [meta.archetype]);
  const sectionNums = useMemo(() => sections.map((section) => section.num), [sections]);
  const { mainRef, activeNum, scrollToSection } = useEditorScrollSpy(sectionNums);
  const dirtyCount = Object.values(editor.dirtySections).filter(Boolean).length;
  // Realtime collaboration: who else is on this fiche, on which section, and the
  // "a peer just saved" conflict signal (§ collab presence design).
  const presence = useEditorPresence({
    objectId,
    activeSection: activeNum,
    dirtySections: editor.dirtySections,
  });
  const sectionCompletions = useMemo(
    () => computeSectionCompletions(editor.draft, navItems, meta.archetype),
    [editor.draft, navItems, meta.archetype],
  );
  // Complétude « perçue visiteur » type-aware (80 % essentiels / 15 % complémentaire / 5 % bonus) —
  // spec docs/superpowers/specs/2026-06-18-completude-par-type-design.md.
  const overallCompletion = useMemo(
    () => computeOverallCompletion(editor.draft, meta.archetype),
    [editor.draft, meta.archetype],
  );
  const validation = useMemo(
    () => validateForPublication(editor.draft, resource.permissions, meta.archetype),
    [editor.draft, meta.archetype, resource.permissions],
  );
  const navSectionState = useMemo(
    () => sectionStateFrom(sectionCompletions, validation, editor.draft, meta.archetype),
    [sectionCompletions, validation, editor.draft, meta.archetype],
  );
  const validationIssues = useMemo(
    () => [...validation.blockers, ...validation.warnings],
    [validation.blockers, validation.warnings],
  );
  const historyItems = useMemo(() => buildHistoryItems(editor.draft), [editor.draft]);
  const sectionLabels = useMemo(
    () => Object.fromEntries(navItems.map((item) => [item.num, item.label])),
    [navItems],
  );

  /** Persist local draft modules to the database (shared by publish and draft-save). */
  async function persistDirtyModules(isCurrent?: () => boolean): Promise<{ ok: boolean; saveErrors: Issue[]; changedDuringSave?: boolean }> {
    if (editor.recoveryConflicts.length > 0) {
      const message = 'Des modifications locales et celles du serveur se chevauchent. Gardez votre brouillon ou choisissez les valeurs du serveur avant de sauvegarder.';
      setStatusMessage(message);
      return { ok: false, saveErrors: [{ section: 'Brouillon local', message, tone: 'warn' }] };
    }
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return { ok: true, saveErrors: [] };
    }

    // State updates replace module values: this reference is the exact request
    // snapshot, including the gallery's shared stable-ID retry allocator.
    const sentModules = editor.draft;
    const result = await save(dirty, resource.permissions, sentModules, {
      canWriteCanonicalDirect,
      baseline: editor.baseline,
      nonApplicableModules: resource.nonApplicableModules,
    });
    // The request may settle after its editor/account has changed. Ignore the
    // old continuation before acknowledgement, presence or status feedback.
    if (isCurrent && !isCurrent()) return { ok: false, saveErrors: [] };
    // Check B against the latest visible C before acknowledgement attaches
    // server IDs/baselines. This never clones the shared gallery retry allocator.
    const changedDuringSave = changedSinceSave(sentModules, latestDraft.current, resource.nonApplicableModules);
    // Only canonical writes establish persisted room IDs. Proposal submission is not a save.
    editor.commitModules(
      result.saved.flatMap((m) => m === 'publication' ? ['generalInfo'] : [MODULE_KEY_MAP[m]]),
      { canonicalRooms: true, canonicalPlaces: true, canonicalModules: result.canonicalModules, sentModules },
    );
    // Submitted proposals fold into the local baseline so the contributor isn't asked to
    // submit the same unchanged values again, but they do not become canonical room records.
    editor.commitModules(
      result.submitted.filter((m) => m !== 'publication').map((m) => MODULE_KEY_MAP[m]),
      { sentModules },
    );
    if (result.submitted.includes('publication')) {
      editor.commitModules(['generalInfo'], { sentModules, publicationSettingsOnly: true });
    }

    // Tell the other editors of this fiche so they can reload before clobbering. Only direct saves
    // changed the DB — submitted proposals are pending and must not signal a peer reload.
    if (result.saved.length > 0) {
      presence.broadcastSaved();
    }

    const issues = saveResultToIssues(result, meta.archetype);
    if (result.failed.length > 0) {
      // §48 — keep the terse save-bar message; the modal carries the full per-section detail.
      setStatusMessage(`${result.failed.length} section(s) en échec : ${result.failed[0].message}`);
      return { ok: false, saveErrors: issues };
    }
    if (result.blocked.length > 0) {
      setStatusMessage(
        `${result.saved.length} section(s) enregistrée(s), ${result.blocked.length} bloquée(s).`,
      );
      return { ok: false, saveErrors: issues };
    }

    return { ok: true, saveErrors: [], changedDuringSave };
  }

  /** Persist work-in-progress without publishing and without the blocker gate. */
  async function handleSaveDraft() {
    if (restoreScope.current.pending) return;
    setStatusMessage(null);
    setSavingDraft(true);
    setSaveFeedback('pending');
    try {
      const { ok, saveErrors: errors } = await persistDirtyModules();
      if (ok) {
        setSaveErrors([]);
        // Confirmation en snackbar (D4 useToast) — le libellé topbar revient à son état « à jour ».
        toast.success(contributorMode ? 'Modification soumise pour validation' : 'Brouillon enregistré');
        flashSuccess(setSaveFeedback, saveFeedbackTimerRef);
      } else {
        setSaveErrors(errors);
        setModalContext('save');
        setBlockersModalOpen(true);
        setSaveFeedback('error');
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublish() {
    if (restoreScope.current.pending) return;
    const generation = publicationGeneration.current;
    const isCurrent = () => publicationMounted.current
      && publicationGeneration.current === generation
      && useSessionStore.getState().userId === userId;
    if (!isCurrent()) return;
    if (validation.blockers.length > 0) {
      setSaveErrors([]);
      setModalContext('publish');
      setBlockersModalOpen(true);
      setStatusMessage(`${validation.blockers.length} blocage(s) empêchent la publication.`);
      return;
    }

    setStatusMessage(null);
    setPublishFeedback('pending');
    const { ok, saveErrors: errors, changedDuringSave } = await persistDirtyModules(isCurrent);
    if (!isCurrent()) return;
    if (!ok) {
      setSaveErrors(errors);
      setModalContext('save');
      setBlockersModalOpen(true);
      setPublishFeedback('error');
      return;
    }
    if (changedDuringSave) {
      setSaveErrors([]);
      setModalContext('publish-deferred');
      setBlockersModalOpen(true);
      setPublishFeedback('idle');
      return;
    }

    try {
      await publishObject.mutateAsync(true);
      if (!isCurrent()) return;
      editor.setSavedStatus('published');
      setSaveErrors([]);
      toast.success('Fiche enregistrée et publiée');
      flashSuccess(setPublishFeedback, publishFeedbackTimerRef);
    } catch (error) {
      if (!isCurrent()) return;
      const issue = publishErrorToIssue(error);
      setSaveErrors([issue]);
      setPublishFeedback('error');
      setModalContext('save');
      setBlockersModalOpen(true);
      setStatusMessage(issue.message);
    }
  }

  /** Open the explanatory modal from the topbar validation chip. */
  function showBlockers() {
    setSaveErrors([]);
    setModalContext('publish');
    setBlockersModalOpen(true);
  }

  function exitToExplorer() {
    if (!confirmLeave()) {
      return;
    }
    router.push('/explorer');
  }

  /** Same drawer as Explorer — stay on the edit route while previewing. */
  function openPreviewDrawer() {
    openDrawer(objectId);
  }

  /** Reload to pull a peer's just-saved changes. The unsaved-draft guard warns first
   *  so a local in-progress draft is never silently discarded. */
  function handleReloadFromPeer() {
    if (!confirmLeave()) {
      return;
    }
    window.location.reload();
  }

  const lastSavedAt = editor.draft.syncIdentifiers.objectUpdatedAt;
  const lastUpdatedSource = editor.draft.syncIdentifiers.objectUpdatedAtSource;
  const typeCode = resource.type ?? '';
  const typeLabel = TYPE_LABEL[typeCode.toUpperCase()] ?? typeCode;

  return (
    <div className={`edit-flat object-editor ${meta.accent}`}>
      <div style={{ display: 'contents' }} inert={workspaceReadFailed || undefined}>
      <EditorTopbar
        objectName={resource.name}
        archetypeCodeName={typeLabel}
        mode={mode}
        dirtyCount={dirtyCount}
        lastSavedAt={lastSavedAt}
        lastUpdatedSource={lastUpdatedSource}
        blockerCount={validation.blockers.length}
        warningCount={validation.warnings.length}
        publishing={publishObject.isPending}
        saving={saving || restoring}
        savingDraft={savingDraft}
        saveFeedback={saveFeedback}
        publishFeedback={publishFeedback}
        contributorMode={contributorMode}
        statusMessage={statusMessage}
        roster={presence.roster}
        onModeChange={setMode}
        onPreview={openPreviewDrawer}
        onCancel={exitToExplorer}
        onPublish={() => void handlePublish()}
        onSaveDraft={() => void handleSaveDraft()}
        onShowBlockers={
          validation.blockers.length > 0 || validation.warnings.length > 0 ? showBlockers : undefined
        }
      />
      {/* D14 : le mode contributeur était invisible (seul un message transitoire au save
          le trahissait) — bandeau persistant expliquant le circuit de validation. */}
      {contributorMode && (
        <div className="contributor-banner" role="note">
          <strong>Mode contributeur</strong> — vos modifications ne s’appliquent pas directement :
          elles sont soumises à la modération de l’organisation avant publication.
        </div>
      )}
      </div>
      {editor.localDraftUnavailable && (
        <div className="contributor-banner" role="alert">
          <strong>Brouillon local indisponible</strong> — Vos modifications restent dans cet onglet. Enregistrez ou exportez-les avant de fermer.
          <button type="button" className="btn" onClick={handleExportLocalDraft}
            disabled={!userId || resource.id !== objectId || editor.objectId !== objectId}>
            Exporter le brouillon JSON
          </button>
        </div>
      )}
      <div style={{ display: 'contents' }} inert={workspaceReadFailed || undefined}>
      {editor.recoveryConflicts.length > 0 && (
        <div className="contributor-banner" role="alert">
          <strong>Brouillon à vérifier</strong> — vos modifications locales sont conservées, mais certaines données ont aussi changé sur le serveur. La sauvegarde est bloquée jusqu’à votre choix.
          <button type="button" className="ghost-button" disabled={restoring} onClick={editor.keepRecoveredDraft}>
            Garder mes modifications
          </button>
          <button
            type="button"
            className="ghost-button"
            disabled={restoring}
            onClick={() => {
              const keys = new Set(editor.recoveryConflicts.map((path) => path.split('.')[0].split('[')[0] as keyof ObjectWorkspaceModules));
              for (const key of keys) {
                if (Object.prototype.hasOwnProperty.call(editor.draft, key)) editor.resetModule(key);
              }
            }}
          >
            Utiliser les valeurs du serveur
          </button>
        </div>
      )}
      <PeerSavedBanner
        notice={presence.savedNotice}
        onReload={handleReloadFromPeer}
        onDismiss={presence.dismissSavedNotice}
      />
      <div className="edit-body">
        <EditorNav
          groups={groups}
          activeNum={activeNum}
          sectionState={navSectionState}
          onSelect={scrollToSection}
          tools={editorTools}
          onToolSelect={handleToolSelect}
        />
        <main ref={mainRef} className="edit-main">
          {sections.map(({ num, Component }) => (
            <div key={num} className="edit-section-host">
              {(presence.peersBySection[num]?.length ?? 0) > 0 && (
                <div className="edit-section-host__badge">
                  <SectionPresenceBadge peers={presence.peersBySection[num]} />
                </div>
              )}
              <Component
                editor={editor}
                permissions={resource.permissions}
                objectId={objectId}
                typeCode={typeCode}
                archetype={meta.archetype}
                folded={mode === 'rapide' && !MODE_ESSENTIAL.has(num)}
              />
            </div>
          ))}
        </main>
        <EditorRail
          objectId={objectId}
          status={editor.draft.generalInfo.status || 'draft'}
          overallCompletion={overallCompletion}
          publishable={validation.blockers.length === 0}
          sections={sectionCompletions}
          issues={validationIssues}
          historyItems={historyItems}
          onGoToSection={scrollToSection}
        />
      </div>
      <VersionHistoryModal
        open={versionsModalOpen}
        onClose={() => setVersionsModalOpen(false)}
        objectId={objectId}
        versions={versionsQuery.data ?? []}
        isLoading={versionsQuery.isLoading}
        canRestore={resource.permissions.publication.canDirectWrite}
        restoreDisabledReason={
          resource.permissions.publication.disabledReason ?? 'Vos droits ne permettent pas de restaurer une version.'
        }
        restoringVersion={restoring ? pendingRestore.versionNumber : null}
        onRestore={(versionNumber) => void handleRestoreVersion(versionNumber)}
      />
      <ConfirmDialog
        open={archiveConfirmOpen}
        title={isArchived ? 'Restaurer la fiche' : 'Archiver la fiche'}
        message={
          isArchived
            ? 'La fiche quittera l’état archivé et redeviendra modifiable (brouillon ou hors-ligne). Elle pourra être republiée.'
            : 'La fiche sera archivée et retirée de l’Explorer. Aucune donnée n’est supprimée — vous pourrez la restaurer.'
        }
        confirmLabel={isArchived ? 'Restaurer' : 'Archiver'}
        cancelLabel="Annuler"
        tone={isArchived ? 'default' : 'danger'}
        onCancel={() => setArchiveConfirmOpen(false)}
        onConfirm={() => void handleArchiveConfirm()}
      />
      <BlockersModal
        open={blockersModalOpen}
        onClose={() => setBlockersModalOpen(false)}
        context={modalContext}
        requiredBlockers={validation.blockers}
        saveErrors={saveErrors}
        warnings={validation.warnings}
        sectionLabels={sectionLabels}
        onGoToSection={(num) => {
          scrollToSection(num);
          setBlockersModalOpen(false);
        }}
      />
      <ImportExportModal
        open={importExportOpen}
        onClose={() => setImportExportOpen(false)}
        onExportJson={() => void handleExportJson()}
        onExportCsv={() => void handleExportCsv()}
        onExportPdf={handleExportPdf}
        onImportFile={(file) => void handleImportFile(file)}
        importError={importError}
      />
      </div>
    </div>
  );
}
