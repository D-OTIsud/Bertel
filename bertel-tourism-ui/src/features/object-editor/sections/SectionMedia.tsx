import { Fs, Input, Repeater, Select, Toggle } from '../primitives';
import type { SectionProps } from './section-types';
import type { ObjectWorkspaceMediaItem } from '../../../services/object-workspace-parser';
import {
  addObjectMediaItem,
  patchObjectMediaItem,
  removeObjectMediaItem,
} from './media-items';

function isVisualMedia(item: ObjectWorkspaceMediaItem) {
  const text = `${item.typeCode} ${item.typeLabel} ${item.kind}`.toLowerCase();
  return ['image', 'photo', 'visuel', 'cover'].some((token) => text.includes(token));
}

function mediaBadge(item: ObjectWorkspaceMediaItem) {
  const code = (item.typeCode || item.kind || 'DOC').toUpperCase();
  return code.slice(0, 3);
}

export function SectionMedia({ editor, folded }: SectionProps) {
  const media = editor.draft.media;
  const photos = media.objectItems.filter(isVisualMedia);
  const documents = media.objectItems.filter((item) => !isVisualMedia(item));
  const recommended = 4;
  const pillTone = photos.length >= recommended ? 'ok' : 'warn';
  const pillLabel = photos.length >= recommended ? `${photos.length} photo(s)` : `${photos.length} / ${recommended}`;

  function patch(id: string, next: Partial<ObjectWorkspaceMediaItem>) {
    editor.replaceModule('media', patchObjectMediaItem(media, id, next));
  }

  return (
    <Fs
      num="06"
      title="Médias"
      sub="Photos (≥ 4 recommandées), documents, vidéo de présentation"
      folded={folded}
      pill={{ tone: pillTone, label: pillLabel }}
    >
      <div className="grid-1-2" style={{ marginBottom: 14 }}>
        <button type="button" className="dropzone" onClick={() => editor.replaceModule('media', addObjectMediaItem(media))}>
          <span className="ico">+</span>
          <strong>Déposer des photos ici</strong>
          <small>JPG/PNG · max 8 Mo · paysage 16:9 recommandé</small>
        </button>
        <div>
          <div className="media-grid">
            {photos.map((item) => (
              <article key={item.id} className="media-tile">
                {item.url ? <img src={item.url} alt={item.description || item.title || 'Media'} /> : null}
                {item.isMain && <span className="media-tile__cover">Cover</span>}
                <div className="media-tile__act">
                  <button type="button" aria-label="Définir comme couverture" onClick={() => patch(item.id, { isMain: true })}>
                    ★
                  </button>
                  <button
                    type="button"
                    aria-label="Supprimer le média"
                    onClick={() => editor.replaceModule('media', removeObjectMediaItem(media, item.id))}
                  >
                    ×
                  </button>
                </div>
                <div className={`media-tile__alt ${item.description || item.title ? '' : 'empty'}`}>
                  {item.description || item.title || 'alt à compléter…'}
                </div>
              </article>
            ))}
            <button type="button" className="media-tile media-tile__add" onClick={() => editor.replaceModule('media', addObjectMediaItem(media))}>
              + Ajouter
            </button>
          </div>
          <div className="char-count" style={{ marginTop: 8 }}>
            Glisser-déposer pour réordonner · La première image est la photo de couverture.
          </div>
        </div>
      </div>

      <div className="chip-group__label">Documents associés</div>
      {documents.length === 0 ? (
        <p style={{ fontSize: 12, color: 'var(--ink-4)', margin: '0 0 8px' }}>Aucun document — ajouter un PDF ou un logo.</p>
      ) : (
        <div className="repeater">
          {documents.map((item) => (
            <div key={item.id} className="rep-row" style={{ gridTemplateColumns: '14px 30px 1fr 90px 80px auto' }}>
              <span className="rep-row__handle" aria-hidden />
              <div className="sync-row__src">{mediaBadge(item)}</div>
              <div>
                <Input value={item.title} placeholder="Titre du document" onChange={(title) => patch(item.id, { title })} />
                <small style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{item.typeLabel || item.typeCode}</small>
              </div>
              <span className="pill-mini">{item.isPublished ? 'Public' : 'Brouillon'}</span>
              <span className="pill-mini">{item.visibility || '—'}</span>
              <div className="rep-row__act">
                <button type="button" className="del" onClick={() => editor.replaceModule('media', removeObjectMediaItem(media, item.id))}>
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button type="button" className="rep-add" onClick={() => editor.replaceModule('media', addObjectMediaItem(media))}>
        + Ajouter un document
      </button>

      <div className="chip-group__label" style={{ marginTop: 14 }}>
        Tous les médias (édition détaillée)
      </div>
      <Repeater
        items={media.objectItems}
        getKey={(item) => item.id}
        columns="14px 120px 1fr 1fr 96px auto"
        addLabel="Ajouter un média"
        onAdd={() => editor.replaceModule('media', addObjectMediaItem(media))}
        renderRow={(item) => (
          <>
            <span className="rep-row__handle" aria-hidden />
            <Select
              value={item.typeCode}
              options={media.typeOptions.map((option) => ({ v: option.code, l: option.label }))}
              onChange={(typeCode) => patch(item.id, { typeCode })}
            />
            <Input value={item.title} placeholder="Titre" onChange={(title) => patch(item.id, { title })} />
            <Input value={item.url} placeholder="URL" onChange={(url) => patch(item.id, { url })} />
            <Toggle label="Publié" on={item.isPublished} onChange={(isPublished) => patch(item.id, { isPublished })} />
            <button type="button" className="del" onClick={() => editor.replaceModule('media', removeObjectMediaItem(media, item.id))}>
              ×
            </button>
          </>
        )}
      />
    </Fs>
  );
}
