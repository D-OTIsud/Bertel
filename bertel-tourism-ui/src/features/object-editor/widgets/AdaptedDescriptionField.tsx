import { useState } from 'react';
import { Plus, Pencil } from 'lucide-react';
import { EditorModal, LangTabs } from '../primitives';
import { MarkdownContent } from '../../../components/markdown/MarkdownContent';
import { MarkdownEditorLazy } from '../../../components/markdown/MarkdownEditorLazy';
import { readTranslatableField, updateTranslatableField } from '../sections/descriptions-field';
import type { ObjectEditorState } from '../useObjectEditorState';
import type {
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceDescriptionScope,
  WorkspaceTranslatableField,
} from '../../../services/object-workspace-parser';

const LANG_LABELS: Record<string, string> = { fr: 'FR', en: 'EN', cre: 'CRE' };

type AdaptedDescriptionFieldProps = {
  editor: ObjectEditorState;
  descriptions: ObjectWorkspaceDescriptionsModule;
  objectScope: ObjectWorkspaceDescriptionScope;
  canEdit: boolean;
};

function hasAnyContent(field: WorkspaceTranslatableField): boolean {
  return field.baseValue.trim() !== '' || Object.values(field.values).some((v) => v.trim() !== '');
}

/** Compact "preview + button → modal" surface for the canonical adapted description.
 *  The modal hosts a Markdown WYSIWYG per language; "Enregistrer" commits the draft into the
 *  descriptions module (the page's global save bar persists it). Single owner since §04 hand-off. */
export function AdaptedDescriptionField({ editor, descriptions, objectScope, canEdit }: AdaptedDescriptionFieldProps) {
  const local = descriptions.localLanguage;
  const field = objectScope.adaptedDescription;
  const filled = hasAnyContent(field);

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<WorkspaceTranslatableField>(field);
  const [activeLang, setActiveLang] = useState(descriptions.activeLanguage || local);

  function openModal() {
    setDraft(field);
    setActiveLang(descriptions.activeLanguage || local);
    setOpen(true);
  }

  function save() {
    editor.replaceModule('descriptions', {
      ...descriptions,
      object: { ...objectScope, adaptedDescription: draft },
    });
    setActiveLang(descriptions.activeLanguage || local);
    setOpen(false);
  }

  const previewMarkdown = readTranslatableField(field, local, local);
  // Preview-card pips reflect the PERSISTED field (what's saved), in the local language.
  const filledLangs = descriptions.availableLanguages.filter(
    (code) => readTranslatableField(field, code, local).trim() !== '',
  );
  // Modal tabs' "filled" dot tracks the in-flight DRAFT (what the user is editing now).
  const langTabs = descriptions.availableLanguages.map((code) => ({
    code,
    label: LANG_LABELS[code] ?? code.toUpperCase(),
    filled: readTranslatableField(draft, code, local).trim() !== '',
  }));

  return (
    <div className="adapted-desc">
      {filled ? (
        <div className="adapted-desc__card">
          <MarkdownContent markdown={previewMarkdown} className="adapted-desc__preview" />
          <div className="adapted-desc__foot">
            <span className="adapted-desc__langs">
              {filledLangs.map((code) => (
                <span key={code} className="pill-mini">{LANG_LABELS[code] ?? code.toUpperCase()}</span>
              ))}
            </span>
            {canEdit && (
              <button type="button" className="btn" onClick={openModal}>
                <Pencil size={14} aria-hidden /> Modifier
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="adapted-desc__empty">
          <span className="muted">Aucune description adaptée</span>
          {canEdit && (
            <button type="button" className="btn" onClick={openModal}>
              <Plus size={14} aria-hidden /> Ajouter une description adaptée
            </button>
          )}
        </div>
      )}

      {!canEdit && (
        <p className="muted" style={{ marginTop: 6 }}>
          Lecture seule : vos droits ne permettent pas d&apos;éditer la version par défaut (canonique).
        </p>
      )}

      {/* Radix Dialog (inside EditorModal) owns visibility via `open`; it unmounts its content
          when closed, so the WYSIWYG (and TipTap) still load lazily on first open. No outer
          `open &&` guard — that double-gate caused a redundant mount + spurious act() warnings. */}
      <EditorModal open={open} title="Description adaptée" onClose={() => setOpen(false)} onSave={save}>
        <LangTabs tabs={langTabs} active={activeLang} onSelect={setActiveLang} />
        <MarkdownEditorLazy
          value={readTranslatableField(draft, activeLang, local)}
          ariaLabel={`Description adaptée — ${LANG_LABELS[activeLang] ?? activeLang.toUpperCase()}`}
          onChange={(md) => setDraft((d) => updateTranslatableField(d, activeLang, local, md))}
        />
      </EditorModal>
    </div>
  );
}
