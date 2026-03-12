import { parseMedia } from './utils';

interface ObjectMediaPanelProps {
  raw: Record<string, unknown>;
}

export function ObjectMediaPanel({ raw }: ObjectMediaPanelProps) {
  const media = parseMedia(raw);

  return (
    <div className="media-grid">
      {media.map((item) => {
        const isInternal = item.tags.includes('interne');

        return (
          <article key={item.id} className="media-card">
            <div className="media-card__image" style={{ backgroundImage: `url(${item.url})` }} />
            <div className="stack-list media-card__body">
              <strong>{item.title}</strong>
              <div className="chip-grid">
                <span className={isInternal ? 'status-pill status-pill--orange' : 'status-pill status-pill--green'}>
                  {isInternal ? 'Usage interne' : 'Public web'}
                </span>
                {item.tags.length > 0 ? item.tags.map((tag) => <span key={tag} className="chip">{tag}</span>) : <span className="chip">tag a definir</span>}
              </div>
            </div>
          </article>
        );
      })}
      <button type="button" className="dropzone-card">Glisser deposer des medias</button>
    </div>
  );
}