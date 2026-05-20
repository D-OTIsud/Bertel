'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useObjectWorkspaceQuery } from '../../hooks/useExplorerQueries';
import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';
import { resolveArchetypeMeta } from './archetypes';
import { useObjectEditorState } from './useObjectEditorState';
import { useEditorSave } from './useEditorSave';
import { makeSections } from './section-config';
import { MODULE_KEY_MAP } from './editor-state';
import { EditorTopbar, type EditorMode } from './shell/EditorTopbar';
import { TypeRibbon } from './shell/TypeRibbon';
import { EditorNav } from './shell/EditorNav';
import { EditorRail } from './shell/EditorRail';
import { EditorFooter } from './shell/EditorFooter';
import { SaveBar } from './shell/SaveBar';
import { SectionIdentity } from './sections/SectionIdentity';
import { SectionDescriptions } from './sections/SectionDescriptions';
import { SectionLocation } from './sections/SectionLocation';
import { SectionContacts } from './sections/SectionContacts';
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

function EditorReady({ resource, objectId }: { resource: ObjectWorkspaceResource; objectId: string }) {
  const router = useRouter();
  const editor = useObjectEditorState(objectId, resource.modules);
  const { save, saving } = useEditorSave(objectId);
  const [mode, setMode] = useState<EditorMode>('complet');
  const [activeNum, setActiveNum] = useState('01');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const meta = resolveArchetypeMeta(resource.type);
  const groups = useMemo(() => makeSections(meta.archetype), [meta.archetype]);
  const dirtyCount = Object.values(editor.dirtySections).filter(Boolean).length;

  async function handleSave() {
    const dirty = (Object.keys(editor.dirtySections) as WorkspaceModuleId[]).filter(
      (m) => editor.dirtySections[m],
    );
    if (dirty.length === 0) {
      return;
    }
    const result = await save(dirty, resource.permissions, editor.draft);
    editor.commitModules(result.saved.map((m) => MODULE_KEY_MAP[m]));
    if (result.failed.length > 0) {
      setStatusMessage(`${result.failed.length} section(s) en échec — voir les détails.`);
    } else if (result.blocked.length > 0) {
      setStatusMessage(`${result.saved.length} enregistrée(s), ${result.blocked.length} bloquée(s) par les droits.`);
    } else {
      setStatusMessage('Modifications enregistrées.');
    }
  }

  function scrollToSection(num: string) {
    setActiveNum(num);
    document.getElementById(`section-${num}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function exitToExplorer() {
    router.push('/explorer');
  }

  return (
    <div className={`object-editor ${meta.accent}`}>
      <EditorTopbar
        objectName={resource.name}
        typeCode={resource.type ?? ''}
        archetypeCodeName={meta.codeName}
        mode={mode}
        dirtyCount={dirtyCount}
        onModeChange={setMode}
        onPreview={exitToExplorer}
        onCancel={exitToExplorer}
        onPublish={() => void handleSave()}
      />
      <TypeRibbon meta={meta} />
      <div className="edit-body">
        <EditorNav groups={groups} activeNum={activeNum} onSelect={scrollToSection} />
        <main className="edit-main">
          <SectionIdentity editor={editor} permissions={resource.permissions} />
          <SectionDescriptions editor={editor} permissions={resource.permissions} />
          <SectionLocation editor={editor} permissions={resource.permissions} />
          <SectionContacts editor={editor} permissions={resource.permissions} />
        </main>
        <EditorRail />
      </div>
      <SaveBar
        dirtyCount={dirtyCount}
        saving={saving}
        onSave={() => void handleSave()}
        statusMessage={statusMessage}
      />
      <EditorFooter onPublish={() => void handleSave()} />
    </div>
  );
}
