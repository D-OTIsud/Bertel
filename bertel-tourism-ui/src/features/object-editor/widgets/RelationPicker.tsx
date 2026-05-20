import { useMemo, useState } from 'react';
import type { ExplorerBucketKey } from '../../../types/domain';
import { useObjectSearch, type ObjectSearchResult } from '../useObjectSearch';

const FILTERS: Array<{ code: ExplorerBucketKey | 'ALL'; label: string }> = [
  { code: 'ALL', label: 'Tous types' },
  { code: 'VIS', label: 'Sites' },
  { code: 'ITI', label: 'Itinéraires' },
  { code: 'HOT', label: 'Hébergements' },
  { code: 'RES', label: 'Restaurants' },
];

interface RelationPickerProps {
  currentObjectId: string;
  onPick: (result: ObjectSearchResult) => void;
}

export function RelationPicker({ currentObjectId, onPick }: RelationPickerProps) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ExplorerBucketKey | 'ALL'>('ALL');
  const buckets = useMemo(() => (filter === 'ALL' ? undefined : [filter]), [filter]);
  const { results, loading } = useObjectSearch(query, { currentObjectId, buckets });

  return (
    <div className="rpick">
      <div className="rpick__head">
        <span className="rpick__icon">⌕</span>
        <input
          className="rpick__input"
          value={query}
          placeholder="Rechercher une fiche à lier"
          onChange={(event) => setQuery(event.target.value)}
        />
        <span className="rpick__hint">↑ ↓ naviguer · Entrée sélectionner · Esc fermer</span>
      </div>
      <div className="rpick__filters">
        {FILTERS.map((item) => (
          <button
            type="button"
            key={item.code}
            className={`chip size-sm${filter === item.code ? ' is-on' : ''}`}
            onClick={() => setFilter(item.code)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="rpick__list">
        {loading && <div className="rpick__empty">Recherche…</div>}
        {!loading && query.trim().length < 2 && <div className="rpick__empty">Tapez au moins 2 caractères.</div>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="rpick__empty">Aucune fiche trouvée.</div>
        )}
        {!loading && results.map((result, index) => (
          <button
            type="button"
            key={result.id}
            className={`rpick__row${index === 0 ? ' is-hi' : ''}`}
            onClick={() => onPick(result)}
          >
            <span className={`rpick__type type-${result.type.toLowerCase()}`}>{result.type}</span>
            <span className="rpick__main">
              <strong>{result.name}</strong>
              <small>{[result.city, result.code].filter(Boolean).join(' · ')}</small>
            </span>
            <span className="rpick__suggest">Lier cette fiche</span>
          </button>
        ))}
      </div>
      <div className="rpick__foot">
        <span>Recherche dans l’index Bertel</span>
      </div>
    </div>
  );
}
