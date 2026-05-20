import { Fs, Input, Select } from '../primitives';
import type { SelectOption } from '../primitives';
import type { SectionProps } from './section-types';
import type {
  ObjectWorkspaceTagColorVariant,
  ObjectWorkspaceTagItem,
} from '../../../services/object-workspace-parser';

/**
 * Plan 4 — Section 09 "Tags & étiquettes".
 *
 * Mirrors `docs/Bertel_design_exemple/edit-classification.jsx → SectionTags`.
 *
 * Tags are the colored display layer shown on Explorer cards and in fiche
 * headers. The displayed list IS the priority order (drag-to-reorder via the
 * move-up / move-down buttons). Color variant + source are per-row metadata
 * stored in `tag_link.extra` via the `save_object_workspace_tags` RPC.
 */

const COLOR_VARIANTS: SelectOption[] = [
  { v: 'teal', l: 'Teal · principal' },
  { v: 'orange', l: 'Orange · accroche' },
  { v: 'neutral', l: 'Neutre' },
  { v: 'outline', l: 'Outline · sobre' },
  { v: 'green', l: 'Vert · statut' },
];

const SOURCE_OPTIONS: SelectOption[] = [
  { v: 'thematic', l: 'Thématique' },
  { v: 'audience', l: 'Public' },
  { v: 'ambience', l: 'Ambiance' },
  { v: 'badges', l: 'Badge éditorial' },
  { v: 'classification', l: 'Auto · classification' },
  { v: 'taxo', l: 'Auto · taxonomie' },
];

interface TagPreviewCardProps {
  tags: ObjectWorkspaceTagItem[];
  resourceName: string;
}

function TagPreviewCard({ tags, resourceName }: TagPreviewCardProps) {
  return (
    <div className="tag-preview">
      <div className="tag-preview__head">
        <strong>Aperçu carte</strong>
        <span style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>tel qu'affiché dans l'Explorer</span>
      </div>
      <div className="tag-preview__card">
        <div className="tag-preview__img" />
        <div className="tag-preview__body">
          <div className="tag-preview__title">{resourceName || 'Aperçu de la fiche'}</div>
          <div className="tag-preview__sub">Hôtel · L'Entre-Deux · Bras-Long</div>
          <div className="tag-preview__tags">
            {tags.slice(0, 4).map((tag, index) => (
              <span key={`${tag.slug}-${index}`} className={`tag ${tag.colorVariant}`}>
                {tag.label}
              </span>
            ))}
            {tags.length > 4 && <span className="tag outline">+{tags.length - 4}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SectionTags({ editor, folded }: SectionProps) {
  const module = editor.draft.tags;
  const displayed = module.displayed;

  function updateTag(index: number, patch: Partial<ObjectWorkspaceTagItem>) {
    editor.replaceModule('tags', {
      ...module,
      displayed: displayed.map((tag, i) => (i === index ? { ...tag, ...patch } : tag)),
    });
  }

  function move(index: number, direction: -1 | 1) {
    const swapIndex = index + direction;
    if (swapIndex < 0 || swapIndex >= displayed.length) return;
    const next = displayed.slice();
    const [moved] = next.splice(index, 1);
    next.splice(swapIndex, 0, moved);
    editor.replaceModule('tags', { ...module, displayed: next });
  }

  function removeTag(index: number) {
    editor.replaceModule('tags', {
      ...module,
      displayed: displayed.filter((_, i) => i !== index),
    });
  }

  return (
    <Fs
      num="09"
      title="Tags & étiquettes"
      sub="Couche d'affichage colorée — apparaît sur la carte Explorer et en tête de fiche. Distincte de la taxonomie métier et des classifications."
      folded={folded}
      pill={{ tone: 'ok', label: `${displayed.length} affichée(s)` }}
    >
      <div className="grid-2-1" style={{ marginBottom: 18 }}>
        <div>
          <div className="chip-group__label" style={{ marginTop: 0 }}>
            Tags affichés en priorité
            <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {' '}(ordre = priorité)
            </span>
          </div>

          {displayed.length === 0 ? (
            <p style={{ fontSize: 12, color: 'var(--ink-4)' }}>
              Aucun tag affiché. Sélectionner un tag dans la bibliothèque pour l'ajouter ici.
            </p>
          ) : (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '14px 1fr 150px 130px auto',
                  gap: 6,
                  padding: '6px 12px',
                  fontSize: 10,
                  fontWeight: 700,
                  color: 'var(--ink-4)',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                }}
              >
                <span />
                <span>Libellé affiché</span>
                <span>Variante couleur</span>
                <span>Source</span>
                <span />
              </div>
              <div className="repeater">
              {displayed.map((tag, index) => (
                <div
                  key={`${tag.slug}-${index}`}
                  className="rep-row"
                  style={{ gridTemplateColumns: '14px 1fr 150px 130px auto', alignItems: 'center' }}
                >
                  <span className="rep-row__handle" />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span className={`tag ${tag.colorVariant}`} style={{ flex: 'none' }}>
                      {tag.label}
                    </span>
                    <Input value={tag.label} onChange={(label) => updateTag(index, { label })} />
                  </div>
                  <Select
                    value={tag.colorVariant}
                    options={COLOR_VARIANTS}
                    onChange={(value) =>
                      updateTag(index, { colorVariant: value as ObjectWorkspaceTagColorVariant })
                    }
                  />
                  <Select
                    value={tag.source}
                    options={SOURCE_OPTIONS}
                    onChange={(value) =>
                      updateTag(index, { source: value as ObjectWorkspaceTagItem['source'] })
                    }
                  />
                  <div className="rep-row__act">
                    <button type="button" title="Monter" onClick={() => move(index, -1)} disabled={index === 0}>
                      ▲
                    </button>
                    <button
                      type="button"
                      title="Descendre"
                      onClick={() => move(index, 1)}
                      disabled={index === displayed.length - 1}
                    >
                      ▼
                    </button>
                    <button type="button" className="del" onClick={() => removeTag(index)}>
                      ✕
                    </button>
                  </div>
                </div>
              ))}
              </div>
            </>
          )}
        </div>

        <TagPreviewCard tags={displayed} resourceName="" />
      </div>

      {module.derived.length > 0 && (
        <>
          <div className="chip-group__label" style={{ marginTop: 18 }}>
            Tags auto-générés
            <span style={{ color: 'var(--ink-4)', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>
              {' '}(dérivés de classification + taxonomie · lecture seule)
            </span>
          </div>
          <div className="chip-set">
            {module.derived.map((tag) => (
              <span key={tag.slug} className="tag outline">
                {tag.label}
                <em style={{ marginLeft: 4, color: 'var(--ink-4)', fontStyle: 'normal' }}>
                  ← {tag.source}
                </em>
              </span>
            ))}
          </div>
        </>
      )}
    </Fs>
  );
}
