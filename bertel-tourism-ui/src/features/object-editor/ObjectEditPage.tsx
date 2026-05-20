'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useObjectWorkspaceQuery, usePublishObjectWorkspaceMutation } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';
import { resolveArchetypeMeta, TYPE_LABEL } from './archetypes';
import { useObjectEditorState } from './useObjectEditorState';
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
import { SaveBar } from './shell/SaveBar';
import { ValidationBanner } from './widgets/ValidationBanner';
import type { HistoryRailItem } from './widgets/HistoryRail';
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
  const editor = useObjectEditorState(objectId, resource.modules);
  const { save, saving } = useEditorSave(objectId);
  const publishObject = usePublishObjectWorkspaceMutation(objectId);
  const [mode, setMode] = useState<EditorMode>('complet');
  const [activeNum, setActiveNum] = useState('01');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const meta = resolveArchetypeMeta(resource.type);
  const groups = useMemo(() => makeSections(meta.archetype), [meta.archetype]);
  const navItems = useMemo(() => flattenSectionItems(groups), [groups]);
  const sections = useMemo(() => getRegisteredSections(meta.archetype), [meta.archetype]);
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

  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) {
      return undefined;
    }
    const nodes = sections
      .map((section) => document.getElementById(`section-${section.num}`))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];
        const num = visible?.target.getAttribute('data-section');
        if (num) {
          setActiveNum(num);
        }
      },
      { root: document.querySelector('.edit-main'), threshold: [0.25, 0.5, 0.75] },
    );
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [sections]);

  async function handleSave() {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return;
    }
    const result = await save(dirty, resource.permissions, editor.draft);
    editor.commitModules(result.saved.flatMap((m) => (m === 'publication' ? ['generalInfo'] : [MODULE_KEY_MAP[m]])));
    if (result.failed.length > 0) {
      setStatusMessage(`${result.failed.length} section(s) en échec — voir les détails.`);
    } else if (result.blocked.length > 0) {
      setStatusMessage(`${result.saved.length} enregistrée(s), ${result.blocked.length} bloquée(s) par les droits.`);
    } else {
      setStatusMessage('Modifications enregistrées.');
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

    try {
      await publishObject.mutateAsync(true);
      setStatusMessage('Publication demandée.');
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Publication impossible.');
    }
  }

  function scrollToSection(num: string) {
    setActiveNum(num);
    document.getElementById(`section-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exitToExplorer() {
    router.push('/explorer');
  }

  const refId = objectId.length > 12 ? objectId.slice(0, 12) : objectId;
  const lastSavedAt = editor.draft.syncIdentifiers.objectUpdatedAt;
  const typeCode = resource.type ?? '';
  const typeLabel = TYPE_LABEL[typeCode.toUpperCase()] ?? typeCode;

  return (
    <div className={`edit-flat object-editor ${meta.accent}`}>
      <EditorTopbar
        objectName={resource.name}
        typeCode={typeCode}
        archetypeCodeName={typeLabel}
        refId={refId}
        mode={mode}
        dirtyCount={dirtyCount}
        lastSavedAt={lastSavedAt}
        blockerCount={validation.blockers.length}
        warningCount={validation.warnings.length}
        publishing={publishObject.isPending}
        publishDisabled={validation.blockers.length > 0}
        onModeChange={setMode}
        onPreview={exitToExplorer}
        onCancel={exitToExplorer}
        onPublish={() => void handlePublish()}
      />
      <div className="edit-body">
        <EditorNav groups={groups} activeNum={activeNum} sectionState={navSectionState} onSelect={scrollToSection} />
        <main className="edit-main">
          <ValidationBanner
            blockers={validation.blockers}
            warnings={validation.warnings}
            typeCode={resource.type ?? ''}
            mode={mode}
            publishing={publishObject.isPending}
            onGoToSection={scrollToSection}
            onPublish={() => void handlePublish()}
          />
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
      <SaveBar
        dirtyCount={dirtyCount}
        saving={saving}
        onSave={() => void handleSave()}
        statusMessage={statusMessage}
      />
      <EditorFooter onPreview={exitToExplorer} onPublish={() => void handlePublish()} />
    </div>
  );
}
