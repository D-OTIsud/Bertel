import { Fs, Field, Input, Repeater, Select, Toggle } from '../primitives';
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

export function SectionMedia({ editor, folded }: SectionProps) {
  const media = editor.draft.media;
  const photos = media.objectItems.filter(isVisualMedia);
  const documents = media.objectItems.filter((item) => !isVisualMedia(item));

  function patch(id: string, next: Partial<ObjectWorkspaceMediaItem>) {
    editor.replaceModule('media', patchObjectMediaItem(media, id, next));
  }

  return (
    <Fs num="06" title="Médias" sub="Photos, documents, vidéo de présentation" folded={folded} pill={{ tone: photos.length >= 4 ? 'ok' : 'warn', label: `${photos.length} photo(s)` }}>
      <div className="grid-1-2" style={{ marginBottom: 14 }}>
        <button type="button" className="dropzone" onClick={() => editor.replaceModule('media', addObjectMediaItem(media))}>
          <span className="ico">+</span>
          <strong>Ajouter un média</strong>
          <small>URL média, titre, crédit et publication</small>
        </button>
        <div className="media-grid">
          {photos.map((item) => (
            <article key={item.id} className="media-tile">
              {item.url ? <img src={item.url} alt={item.description || item.title || 'Media'} /> : null}
              {item.isMain && <span className="media-tile__cover">Cover</span>}
              <div className={`media-tile__alt ${item.description ? '' : 'empty'}`}>
                {item.description || item.title || 'Alt à renseigner'}
              </div>
              <div className="media-tile__act">
                <button type="button" aria-label="Définir comme couverture" onClick={() => patch(item.id, { isMain: true })}>★</button>
                <button type="button" aria-label="Supprimer le média" onClick={() => editor.replaceModule('media', removeObjectMediaItem(media, item.id))}>×</button>
              </div>
            </article>
          ))}
          <button type="button" className="media-tile media-tile__add" onClick={() => editor.replaceModule('media', addObjectMediaItem(media))}>
            + Média
          </button>
        </div>
      </div>

      <Repeater
        items={media.objectItems}
        getKey={(item) => item.id}
        columns="120px 1fr 1fr 96px auto"
        addLabel="Ajouter un média"
        onAdd={() => editor.replaceModule('media', addObjectMediaItem(media))}
        renderRow={(item) => (
          <>
            <Select
              value={item.typeCode}
              options={media.typeOptions.map((option) => ({ v: option.code, l: option.label }))}
              onChange={(typeCode) => patch(item.id, { typeCode })}
            />
            <Input value={item.title} placeholder="Titre" onChange={(title) => patch(item.id, { title })} />
            <Input value={item.url} placeholder="URL" onChange={(url) => patch(item.id, { url })} />
            <Toggle label="Publié" on={item.isPublished} onChange={(isPublished) => patch(item.id, { isPublished })} />
            <button type="button" className="del" onClick={() => editor.replaceModule('media', removeObjectMediaItem(media, item.id))}>
              Supprimer
            </button>
          </>
        )}
      />

      {documents.length > 0 && (
        <>
          <div className="chip-group__label">Documents</div>
          {documents.map((item) => (
            <Field key={item.id} label={item.typeLabel || item.typeCode || 'Document'}>
              <Input value={item.title || item.url} onChange={(title) => patch(item.id, { title })} />
            </Field>
          ))}
        </>
      )}
    </Fs>
  );
}
