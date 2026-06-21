import { useState } from 'react';
import { Fs, SortableList } from '../primitives';
import { ResultCardView } from '../../../components/explorer/ResultCardView';
import { TagPickerModal } from '../widgets/TagPickerModal';
import { tagChipStyle } from '../../../utils/explorer-card';
import { buildPreviewCardFromDraft } from './tags-preview';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceTagItem, ObjectWorkspaceTagsModule } from '../../../services/object-workspace-parser';

/**
 * Plan §76 — Section 09 "Tags & étiquettes" (redesign).
 *
 * Tags are the curated COLORED display layer shown on Explorer cards + the map. The list IS the
 * priority order (drag to reorder → tag_link.position, which the card now honors). Color is GLOBAL
 * per tag (ref_tag.color, hex) and is chosen ONCE, at creation, in the "Ajouter un tag" modal —
 * shown read-only on each chip afterwards. Editing/recoloring an existing tag is an admin action
 * that lives in the (future) list-administration page, NOT here: there is deliberately no on-the-fly
 * recolor control in the editor, because the color is global (a recolor would silently affect every
 * object carrying that tag). The right pane is the REAL Explorer card (shared ResultCardView) built
 * from the live draft, so reorder/add/remove are reflected truthfully and instantly.
 */

type ModalState = { open: boolean };

function sameTag(a: ObjectWorkspaceTagItem, b: ObjectWorkspaceTagItem): boolean {
  return a.tagId && b.tagId ? a.tagId === b.tagId : a.slug === b.slug;
}

export function SectionTags({ editor, permissions, objectId, typeCode, folded }: SectionProps) {
  const module = editor.draft.tags;
  const displayed = module.displayed;
  const writable = permissions?.tags?.canDirectWrite ?? false;
  const disabledReason = permissions?.tags?.disabledReason ?? null;
  const [modal, setModal] = useState<ModalState>({ open: false });

  const previewCard = buildPreviewCardFromDraft(editor, typeCode);

  // The add control lives in the preview column (under "Aperçu carte") so it reads as the section's
  // primary call-to-action — a real `rep-add` button (the editor-wide "+ Ajouter…" affordance),
  // not the bare text link it used to be.
  const addControl = writable ? (
    <button
      type="button"
      className="rep-add"
      onClick={() => setModal({ open: true })}
      style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}
    >
      + Ajouter un tag
    </button>
  ) : (
    <p className="muted" style={{ marginTop: 12 }}>
      {disabledReason ?? 'Lecture seule.'}
    </p>
  );

  function setModule(next: ObjectWorkspaceTagsModule) {
    editor.replaceModule('tags', next);
  }

  function addTag(tag: ObjectWorkspaceTagItem) {
    if (displayed.some((d) => sameTag(d, tag))) return;
    setModule({
      ...module,
      displayed: [...displayed, tag],
      library: module.library.filter((l) => !sameTag(l, tag)),
    });
  }

  function removeTag(index: number) {
    const removed = displayed[index];
    setModule({
      ...module,
      displayed: displayed.filter((_, i) => i !== index),
      // Return the removed tag to the library so it stays re-addable.
      library: removed && !module.library.some((l) => sameTag(l, removed)) ? [...module.library, removed] : module.library,
    });
  }

  return (
    <Fs
      num="11"
      title="Tags & étiquettes"
      sub="Couche d'affichage colorée — apparaît sur la carte Explorer et en tête de fiche. Distincte de la taxonomie métier et des classifications."
      folded={folded}
      pill={{ tone: 'ok', label: `${displayed.length} affichée(s)` }}
    >
      {/* 50/50 split (list ↔ preview): self-contained responsive grid via auto-fit + minmax —
          two equal columns when wide, single column under ~580px — so we don't override the
          shared .grid-2-1 (2fr 1fr) used elsewhere, nor fight its mobile media query. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 12,
          marginBottom: 4,
        }}
      >
        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Tags affichés en priorité
            <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {' '}(glisser pour réordonner)
            </span>
          </div>

          {displayed.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
              Aucun tag affiché.{writable ? ' Ajoutez-en un avec le bouton ci-contre.' : ''}
            </p>
          ) : (
            <SortableList
              items={displayed}
              getId={(t) => t.tagId || t.slug}
              onReorder={(next) => setModule({ ...module, displayed: next })}
              columns="14px 1fr auto"
              renderItem={(tag, index) => (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', minWidth: 0 }}>
                    <span
                      style={{
                        ...tagChipStyle(tag.color),
                        padding: '3px 10px',
                        borderRadius: 6,
                        fontSize: 12,
                        fontWeight: 600,
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {tag.label}
                    </span>
                  </div>
                  <div className="rep-row__act">
                    <button
                      type="button"
                      className="del"
                      disabled={!writable}
                      aria-label={`Retirer ${tag.label}`}
                      onClick={() => removeTag(index)}
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            />
          )}

          <p className="muted" style={{ marginTop: 12, fontSize: 11.5 }}>
            Les classements certifiés (étoiles, labels) priment sur ces tags dans l’espace limité de la carte.
          </p>
        </div>

        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Aperçu carte
            <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {' '}(tel qu’affiché dans l’Explorer)
            </span>
          </div>
          <ResultCardView card={previewCard} interactive={false} />
          {addControl}
        </div>
      </div>

      <TagPickerModal
        open={modal.open}
        anchorObjectId={objectId}
        library={module.library}
        displayed={displayed}
        onClose={() => setModal({ open: false })}
        onAdd={addTag}
      />
    </Fs>
  );
}
