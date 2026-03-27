import { useMemo, useState } from 'react';
import type { ModifierMediaAsset, ModifierPayload } from '../../services/modifier-payload';
import { ModifierEmptyState, ModifierSectionHero, ModifierTooltip } from './modifier-shared';

interface ObjectMediaPanelProps {
  payload: ModifierPayload;
}

type MediaFilter = 'all' | ModifierMediaAsset['context'];

const MEDIA_FILTERS: Array<{ id: MediaFilter; label: string; countKey?: string }> = [
  { id: 'all', label: 'Tout' },
  { id: 'object', label: 'Objet', countKey: 'media_object' },
  { id: 'place', label: 'Lieu', countKey: 'media_place' },
  { id: 'room', label: 'Chambre', countKey: 'media_room' },
  { id: 'stage', label: 'Etape', countKey: 'media_stage' },
  { id: 'menu-item', label: 'Menu', countKey: 'media_menu' },
];

export function ObjectMediaPanel({ payload }: ObjectMediaPanelProps) {
  const [filter, setFilter] = useState<MediaFilter>('all');

  const visibleAssets = useMemo(() => {
    if (filter === 'all') {
      return payload.media.assets;
    }

    return payload.media.assets.filter((asset) => asset.context === filter);
  }, [filter, payload.media.assets]);

  if (!payload.media.assets.length) {
    return (
      <ModifierEmptyState
        title="Pas de media"
        body="La fiche n expose pas encore de galerie ou de media lies a ses sous-surfaces."
      />
    );
  }

  return (
    <div className="drawer-form-stack">
      <ModifierSectionHero
        kicker="Media"
        title="Galerie principale et medias lies"
        description="Le panneau reste lean grace a des filtres par contexte: l objet garde sa galerie hero, puis les medias de lieux, chambres, etapes ou items se branchent sans creer d onglets supplementaires."
        stats={[
          { label: 'Media', value: String(payload.media.assets.length) },
          { label: 'Objet', value: String(payload.navCounts.media_object ?? 0) },
          { label: 'Chambres', value: String(payload.navCounts.media_room ?? 0) },
          { label: 'Etapes', value: String(payload.navCounts.media_stage ?? 0) },
        ]}
        chips={payload.media.objectMedia.slice(0, 4).flatMap((item) => item.tags).slice(0, 4)}
      />

      <section className="panel-card panel-card--nested">
        <div className="modifier-filter-row">
          {MEDIA_FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={filter === item.id ? 'modifier-filter-chip modifier-filter-chip--active' : 'modifier-filter-chip'}
              onClick={() => setFilter(item.id)}
            >
              <span>{item.label}</span>
              {item.countKey && typeof payload.navCounts[item.countKey] === 'number' && <span>{payload.navCounts[item.countKey]}</span>}
            </button>
          ))}
        </div>
      </section>

      <div className="media-grid modifier-media-grid">
        {visibleAssets.map((item) => {
          const isInternal = item.tags.some((tag) => tag.toLowerCase().includes('interne'));

          return (
            <article key={`${item.context}-${item.id}`} className="media-card modifier-media-card">
              <div className="media-card__image" style={{ backgroundImage: `url(${item.url})` }} />
              <div className="stack-list media-card__body">
                <div className="media-card__header">
                  <strong>{item.title || item.contextLabel}</strong>
                  <ModifierTooltip content={item.detail}>
                    <span className="detail-chip detail-chip--soft">{item.contextLabel}</span>
                  </ModifierTooltip>
                </div>
                <div className="chip-grid">
                  <span className={isInternal ? 'status-pill status-pill--orange' : 'status-pill status-pill--green'}>
                    {isInternal ? 'Usage interne' : 'Publie'}
                  </span>
                  {item.tags.length > 0 ? item.tags.map((tag) => <span key={`${item.id}-${tag}`} className="chip">{tag}</span>) : <span className="chip">sans tag</span>}
                </div>
                {item.credit && <small>{item.credit}</small>}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
