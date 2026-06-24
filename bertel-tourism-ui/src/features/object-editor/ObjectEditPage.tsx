'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '../../store/ui-store';
import { useSessionStore } from '../../store/session-store';
import { getObjectWorkspaceResource } from '../../services/object-workspace';
import { useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation, useSetObjectStatusMutation, useObjectVersionsQuery, useRestoreObjectVersionMutation } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { getArchetypeMeta, type ArchetypeCode, type ArchetypeMeta, TYPE_LABEL } from './archetypes';
import { useObjectEditorState } from './useObjectEditorState';
import { useUnsavedDraftGuard } from './useUnsavedDraftGuard';
import { useEditorSave } from './useEditorSave';
import { makeSections, type SectionItem } from './section-config';
import { MODULE_KEY_MAP } from './editor-state';
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
import { EditorTopbar, type EditorMode } from './shell/EditorTopbar';
import { EditorNav, type EditorNavSectionState } from './shell/EditorNav';
import { EditorRail } from './shell/EditorRail';
import { useEditorPresence } from './presence/useEditorPresence';
import { SectionPresenceBadge } from './widgets/SectionPresenceBadge';
import { PeerSavedBanner } from './widgets/PeerSavedBanner';
import { ConfirmDialog } from './primitives';
import { buildEditorTools, archiveTargetStatus, type EditorToolKey } from './shell/editor-tools';
import type { HistoryRailItem } from './widgets/HistoryRail';
import { useEditorScrollSpy } from './useEditorScrollSpy';
import './object-editor.css';
import './editor-print.css';

/** Full-page object editor. Fetches the workspace resource, then hands off to
 *  EditorReady so the editor hooks only run once data is present. */
export function ObjectEditPage({ objectId }: { objectId: string }) {
  const { data, isError, error } = useObjectWorkspaceQuery(objectId);
  if (isError) {
    return <div className="panel-card panel-card--warning">{(error as Error).message}</div>;
  }
  if (!data) {
    return <div className="panel-card">Chargement de l&apos;éditeur…</div>;
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
  return <EditorReady resource={data} objectId={objectId} meta={meta} />;
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

function EditorReady({ resource, objectId, meta }: { resource: ObjectWorkspaceResource; objectId: string; meta: ArchetypeMeta }) {
  const router = useRouter();
  const openDrawer = useUiStore((state) => state.openDrawer);
  const editor = useObjectEditorState(objectId, resource.modules);
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
  const [modalContext, setModalContext] = useState<'publish' | 'save'>('publish');
  const [saveErrors, setSaveErrors] = useState<Issue[]>([]);

  const setObjectStatus = useSetObjectStatusMutation(objectId);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);

  const versionsQuery = useObjectVersionsQuery(objectId);
  const restoreVersion = useRestoreObjectVersionMutation(objectId);
  const [versionsModalOpen, setVersionsModalOpen] = useState(false);

  // §E Import / export — frontend-only tool (no backend, no object creation).
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  async function handleExportJson() {
    try {
      const ws = await getObjectWorkspaceResource(objectId, langPrefs);
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
      const ws = await getObjectWorkspaceResource(objectId, langPrefs);
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
    try {
      await restoreVersion.mutateAsync(versionNumber);
      setVersionsModalOpen(false);
      setStatusMessage(`Version v${versionNumber} restaurée — une nouvelle version a été créée.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Restauration impossible.');
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
      setStatusMessage(error instanceof Error ? error.message : 'Changement de statut impossible.');
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
    () => computeSectionCompletions(editor.draft, navItems),
    [editor.draft, navItems],
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
  async function persistDirtyModules(): Promise<{ ok: boolean; saveErrors: Issue[] }> {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return { ok: true, saveErrors: [] };
    }

    const result = await save(dirty, resource.permissions, editor.draft, {
      canWriteCanonicalDirect,
      baseline: editor.baseline,
    });
    // Both direct saves and submitted proposals fold back into the baseline so the editor reads
    // clean (a contributor's submitted section is no longer dirty — it is pending moderation).
    editor.commitModules(
      [...result.saved, ...result.submitted].flatMap((m) =>
        m === 'publication' ? ['generalInfo'] : [MODULE_KEY_MAP[m]],
      ),
    );

    // Tell the other editors of this fiche so they can reload before clobbering. Only direct saves
    // changed the DB — submitted proposals are pending and must not signal a peer reload.
    if (result.saved.length > 0) {
      presence.broadcastSaved(result.saved);
    }

    const issues = saveResultToIssues(result);
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

    return { ok: true, saveErrors: [] };
  }

  /** Persist work-in-progress without publishing and without the blocker gate. */
  async function handleSaveDraft() {
    setStatusMessage(null);
    setSavingDraft(true);
    try {
      const { ok, saveErrors: errors } = await persistDirtyModules();
      if (ok) {
        setSaveErrors([]);
        setStatusMessage(contributorMode ? 'Modification soumise pour validation.' : 'Brouillon enregistré.');
      } else {
        setSaveErrors(errors);
        setModalContext('save');
        setBlockersModalOpen(true);
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublish() {
    if (validation.blockers.length > 0) {
      setSaveErrors([]);
      setModalContext('publish');
      setBlockersModalOpen(true);
      setStatusMessage(`${validation.blockers.length} blocage(s) empêchent la publication.`);
      return;
    }

    setStatusMessage(null);
    const { ok, saveErrors: errors } = await persistDirtyModules();
    if (!ok) {
      setSaveErrors(errors);
      setModalContext('save');
      setBlockersModalOpen(true);
      return;
    }

    try {
      await publishObject.mutateAsync(true);
      editor.setSavedStatus('published');
      setSaveErrors([]);
      setStatusMessage('Fiche enregistrée et publiée.');
    } catch (error) {
      const issue = publishErrorToIssue(error);
      setSaveErrors([issue]);
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
        saving={saving}
        savingDraft={savingDraft}
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
        restoringVersion={restoreVersion.isPending ? (restoreVersion.variables ?? null) : null}
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
  );
}
