'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUiStore } from '../../store/ui-store';
import { useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { resolveArchetypeMeta, TYPE_LABEL } from './archetypes';
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
import { getRegisteredSections, MODE_ESSENTIAL } from './sections/section-registry';
import { EditorTopbar, type EditorMode } from './shell/EditorTopbar';
import { EditorNav, type EditorNavSectionState } from './shell/EditorNav';
import { EditorRail } from './shell/EditorRail';
import { EditorFooter } from './shell/EditorFooter';
import type { HistoryRailItem } from './widgets/HistoryRail';
import { useEditorScrollSpy } from './useEditorScrollSpy';
import './object-editor.css';

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
  return <EditorReady resource={data} objectId={objectId} />;
}

function flattenSectionItems(groups: ReturnType<typeof makeSections>): SectionItem[] {
  return groups.flatMap((group) => group.items);
}

function sectionStateFrom(
  completions: SectionCompletion[],
  validation: { blockers: Issue[]; warnings: Issue[] },
  draft: ObjectWorkspaceModules,
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
      const hint = computeNavHint(completion.num, draft, completion.pct);
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

function EditorReady({ resource, objectId }: { resource: ObjectWorkspaceResource; objectId: string }) {
  const router = useRouter();
  const openDrawer = useUiStore((state) => state.openDrawer);
  const editor = useObjectEditorState(objectId, resource.modules);
  const { confirmLeave } = useUnsavedDraftGuard(editor.isDirty);
  const { save, saving } = useEditorSave(objectId);
  const publishObject = usePublishObjectWorkspaceMutation(objectId);
  const [mode, setMode] = useState<EditorMode>('complet');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);

  const meta = resolveArchetypeMeta(resource.type);
  const groups = useMemo(() => makeSections(meta.archetype), [meta.archetype]);
  const navItems = useMemo(() => flattenSectionItems(groups), [groups]);
  const sections = useMemo(() => getRegisteredSections(meta.archetype), [meta.archetype]);
  const sectionNums = useMemo(() => sections.map((section) => section.num), [sections]);
  const { mainRef, activeNum, scrollToSection } = useEditorScrollSpy(sectionNums);
  const dirtyCount = Object.values(editor.dirtySections).filter(Boolean).length;
  const sectionCompletions = useMemo(
    () => computeSectionCompletions(editor.draft, navItems),
    [editor.draft, navItems],
  );
  const overallCompletion = useMemo(() => computeOverallCompletion(editor.draft), [editor.draft]);
  const validation = useMemo(
    () => validateForPublication(editor.draft, resource.permissions, meta.archetype),
    [editor.draft, meta.archetype, resource.permissions],
  );
  const navSectionState = useMemo(
    () => sectionStateFrom(sectionCompletions, validation, editor.draft),
    [sectionCompletions, validation, editor.draft],
  );
  const validationIssues = useMemo(
    () => [...validation.blockers, ...validation.warnings],
    [validation.blockers, validation.warnings],
  );
  const historyItems = useMemo(() => buildHistoryItems(editor.draft), [editor.draft]);

  /** Persist local draft modules to the database (called only from publish, not a separate save action). */
  async function persistDirtyModules(): Promise<boolean> {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return true;
    }

    const result = await save(dirty, resource.permissions, editor.draft);
    editor.commitModules(
      result.saved.flatMap((m) => (m === 'publication' ? ['generalInfo'] : [MODULE_KEY_MAP[m]])),
    );

    if (result.failed.length > 0) {
      setStatusMessage(`${result.failed.length} section(s) en échec — publication annulée.`);
      return false;
    }
    if (result.blocked.length > 0) {
      setStatusMessage(
        `${result.saved.length} section(s) enregistrée(s), ${result.blocked.length} bloquée(s) — publication annulée.`,
      );
      return false;
    }

    return true;
  }

  /** Persist work-in-progress without publishing and without the blocker gate. */
  async function handleSaveDraft() {
    setStatusMessage(null);
    setSavingDraft(true);
    try {
      const ok = await persistDirtyModules();
      if (ok) {
        setStatusMessage('Brouillon enregistré.');
      }
    } finally {
      setSavingDraft(false);
    }
  }

  async function handlePublish() {
    if (validation.blockers.length > 0) {
      const first = validation.blockers[0];
      setStatusMessage(`${validation.blockers.length} blocage(s) empêchent la publication.`);
      if (first) {
        scrollToSection(first.section);
      }
      return;
    }

    setStatusMessage(null);
    const persisted = await persistDirtyModules();
    if (!persisted) {
      return;
    }

    try {
      await publishObject.mutateAsync(true);
      editor.setSavedStatus('published');
      setStatusMessage('Fiche enregistrée et publiée.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Publication impossible.');
    }
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
        publishDisabled={validation.blockers.length > 0}
        statusMessage={statusMessage}
        onModeChange={setMode}
        onPreview={openPreviewDrawer}
        onCancel={exitToExplorer}
        onPublish={() => void handlePublish()}
        onSaveDraft={() => void handleSaveDraft()}
      />
      <div className="edit-body">
        <EditorNav groups={groups} activeNum={activeNum} sectionState={navSectionState} onSelect={scrollToSection} />
        <main ref={mainRef} className="edit-main">
          {sections.map(({ num, Component }) => (
            <Component
              key={num}
              editor={editor}
              permissions={resource.permissions}
              objectId={objectId}
              typeCode={typeCode}
              archetype={meta.archetype}
              folded={mode === 'rapide' && !MODE_ESSENTIAL.has(num)}
            />
          ))}
        </main>
        <EditorRail
          objectId={objectId}
          overallCompletion={overallCompletion}
          sections={sectionCompletions}
          issues={validationIssues}
          historyItems={historyItems}
          onGoToSection={scrollToSection}
        />
      </div>
      <EditorFooter onPreview={openPreviewDrawer} onSaveDraft={() => void handleSaveDraft()} savingDraft={savingDraft} />
    </div>
  );
}
