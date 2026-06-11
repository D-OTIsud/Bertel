import { useState } from 'react';
import { Pencil, Star, Trash2 } from 'lucide-react';
import { Fs, SortableGrid } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';
import {
  AUTHORABLE_MEDIA_TYPE_CODES,
  createObjectMediaItem,
  patchObjectMediaItem,
  removeObjectMediaItem,
  reorderObjectMediaItems,
} from './media-items';
import { MediaEditModal } from '../widgets/MediaEditModal';
import { ModuleUnavailableNotice } from './blocks/block-notes';

function isVisualMedia(item: ObjectWorkspaceMediaItem) {
  const text = `${item.typeCode} ${item.typeLabel} ${item.kind}`.toLowerCase();
  return ['image', 'photo', 'visuel', 'cover'].some((token) => text.includes(token));
}

function mediaBadge(item: ObjectWorkspaceMediaItem) {
  const code = (item.typeCode || item.kind || 'DOC').toUpperCase();
  return code.slice(0, 3);
}

function titleFallback(item: ObjectWorkspaceMediaItem) {
  if (item.title) return item.title;
  if (item.url) {
    const parts = item.url.split('/');
    return parts[parts.length - 1] || item.url;
  }
  return 'sans titre';
}

export function SectionMedia({ editor, permissions: _permissions, objectId, folded }: SectionProps) {
  const media = editor.draft.media;
  const [editing, setEditing] = useState<string | null>(null);
  // In-memory draft for the "+ Ajouter un média" flow. The new item lives here
  // until the user saves, so a Cancel leaves the editor's media module
  // untouched (no phantom tile in the grid). Existing-item edits still go
  // through patchObjectMediaItem against the live module.
  const [draftNewItem, setDraftNewItem] = useState<ObjectWorkspaceMediaItem | null>(null);

  const photos = media.objectItems.filter(isVisualMedia);
  const authorableTypeOptions = media.typeOptions.filter((option) =>
    AUTHORABLE_MEDIA_TYPE_CODES.includes(option.code),
  );
  const recommended = 4;
  const unavailable = Boolean(media.unavailableReason);
  const pillTone = unavailable || photos.length < recommended ? 'warn' : 'ok';
  const pillLabel = unavailable
    ? 'Indisponible'
    : photos.length >= recommended
      ? `${photos.length} photo(s)`
      : `${photos.length} / ${recommended}`;

  function handleAdd() {
    const item = createObjectMediaItem(media);
    setDraftNewItem(item);
    setEditing(item.id);
  }

  function handleDelete(id: string) {
    editor.replaceModule('media', removeObjectMediaItem(media, id));
  }

  // Resolve the item the modal is editing: an existing saved item, or — if the
  // user just clicked "+ Ajouter un média" — the in-memory draft that has not
  // yet been appended to the module.
  const editingItem = editing
    ? media.objectItems.find((m) => m.id === editing) ?? draftNewItem
    : null;

  return (
    <Fs
      num="05"
      title="Médias"
      sub="Photos (≥ 4 recommandées) — les documents (menus, certificats…) s'ajoutent depuis leurs sections"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      {/* R1 no-clobber: a failed load renders the notice INSTEAD of an empty grid —
          editing an empty grid born from a failure would delete every media row on
          save (the saver also throws on this reason, defense-in-depth). */}
      {unavailable && <ModuleUnavailableNotice reason={media.unavailableReason as string} />}

      {!unavailable && (
      <SortableGrid
        items={media.objectItems}
        getId={(item) => item.id}
        className="media-grid"
        onReorder={(next) => editor.replaceModule('media', reorderObjectMediaItems(media, next))}
        renderItem={(item, _index, handle) => (
          <article className="media-tile">
            {isVisualMedia(item) && item.url ? (
              <img src={item.url} alt={item.description || item.title || 'Média'} />
            ) : (
              <div className="media-tile__badge">{mediaBadge(item)}</div>
            )}
            {item.isMain && <span className="media-tile__cover">★</span>}
            <div className="media-tile__info">
              <span className="media-tile__type">{item.typeLabel}</span>
              <span className="media-tile__name">{titleFallback(item)}</span>
            </div>
            <div className="media-tile__act">
              {handle}
              <button
                type="button"
                className={`cover-btn${item.isMain ? ' is-on' : ''}`}
                aria-label={item.isMain ? 'Photo de couverture actuelle' : 'Définir comme photo de couverture'}
                aria-pressed={item.isMain}
                disabled={item.isMain}
                onClick={() => editor.replaceModule('media', patchObjectMediaItem(media, item.id, { isMain: true }))}
              >
                <Star size={12} fill={item.isMain ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                aria-label={`Modifier le média ${item.title || 'sans titre'}`}
                onClick={() => setEditing(item.id)}
              >
                <Pencil size={12} />
              </button>
              <button
                type="button"
                aria-label="Supprimer le média"
                onClick={() => handleDelete(item.id)}
              >
                <Trash2 size={12} />
              </button>
            </div>
          </article>
        )}
      />
      )}

      {!unavailable && (
      <button type="button" className="rep-add" onClick={handleAdd}>
        + Ajouter un média
      </button>
      )}

      {editing && editingItem && objectId && (
        <MediaEditModal
          open
          media={editingItem}
          // Only authorable types are offered (documents are created from their owning
          // sections); an existing document item renders its type read-only in the modal.
          typeOptions={authorableTypeOptions}
          languages={editor.draft.descriptions.availableLanguages}
          objectId={objectId}
          onClose={() => {
            setEditing(null);
            setDraftNewItem(null);
          }}
          onSave={(updated) => {
            if (draftNewItem && draftNewItem.id === updated.id) {
              // First save for a freshly created draft: append it now.
              editor.replaceModule('media', {
                ...media,
                objectItems: [...media.objectItems, updated],
              });
            } else {
              // Editing an existing saved item: patch in place.
              editor.replaceModule('media', patchObjectMediaItem(media, updated.id, updated));
            }
            setEditing(null);
            setDraftNewItem(null);
          }}
        />
      )}
    </Fs>
  );
}
