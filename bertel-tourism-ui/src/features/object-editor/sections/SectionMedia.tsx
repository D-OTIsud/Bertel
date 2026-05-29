import { useState } from 'react';
import { Fs } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';
import {
  addObjectMediaItem,
  patchObjectMediaItem,
  removeObjectMediaItem,
} from './media-items';
import { MediaEditModal } from '../widgets/MediaEditModal';

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

  const photos = media.objectItems.filter(isVisualMedia);
  const recommended = 4;
  const pillTone = photos.length >= recommended ? 'ok' : 'warn';
  const pillLabel = photos.length >= recommended ? `${photos.length} photo(s)` : `${photos.length} / ${recommended}`;

  function handleAdd() {
    const nextMedia = addObjectMediaItem(media);
    editor.replaceModule('media', nextMedia);
    const newItem = nextMedia.objectItems[nextMedia.objectItems.length - 1];
    setEditing(newItem.id);
  }

  function handleDelete(id: string) {
    editor.replaceModule('media', removeObjectMediaItem(media, id));
  }

  const editingItem = editing ? media.objectItems.find((m) => m.id === editing) ?? null : null;

  return (
    <Fs
      num="06"
      title="Médias"
      sub="Photos (≥ 4 recommandées), documents, vidéo de présentation"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      <div className="media-grid">
        {media.objectItems.map((item) => (
          <article key={item.id} className="media-tile">
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
              <button
                type="button"
                aria-label={`Modifier le média ${item.title || 'sans titre'}`}
                onClick={() => setEditing(item.id)}
              >
                ✏
              </button>
              <button
                type="button"
                aria-label="Supprimer le média"
                onClick={() => handleDelete(item.id)}
              >
                ×
              </button>
            </div>
          </article>
        ))}
      </div>

      <button type="button" className="rep-add" onClick={handleAdd}>
        + Ajouter un média
      </button>

      {editing && editingItem && objectId && (
        <MediaEditModal
          open
          media={editingItem}
          typeOptions={media.typeOptions}
          languages={editor.draft.descriptions.availableLanguages}
          objectId={objectId}
          onClose={() => setEditing(null)}
          onSave={(updated) => {
            editor.replaceModule('media', patchObjectMediaItem(media, updated.id, updated));
            setEditing(null);
          }}
        />
      )}
    </Fs>
  );
}
