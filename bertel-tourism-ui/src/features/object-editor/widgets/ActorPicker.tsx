import { useEffect, useState } from 'react';
import { searchActors, type ActorSearchResult } from '../../../services/object-workspace';

interface ActorPickerProps {
  onPick: (actor: ActorSearchResult) => void;
}

/**
 * §48 — actor search picker for §17 (mirrors RelationPicker's `rpick` shell so the §15/§17
 * pickers look identical). Searches via api.search_actors — SECURITY DEFINER, editor-gated
 * and scoped to caller-readable actors server-side. 300ms debounce, min 2 characters.
 */
export function ActorPicker({ onPick }: ActorPickerProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ActorSearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    let cancelled = false;
    const handle = setTimeout(() => {
      void searchActors(query).then((rows) => {
        if (cancelled) return;
        setResults(rows);
        setLoading(false);
      });
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query]);

  return (
    <div className="rpick">
      <div className="rpick__head">
        <span className="rpick__icon">⌕</span>
        <input
          className="rpick__input"
          autoFocus
          value={query}
          placeholder="Rechercher un acteur (nom, prénom)…"
          aria-label="Rechercher un acteur"
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <div className="rpick__list">
        {loading && <div className="rpick__empty">Recherche…</div>}
        {!loading && query.trim().length < 2 && <div className="rpick__empty">Tapez au moins 2 caractères.</div>}
        {!loading && query.trim().length >= 2 && results.length === 0 && (
          <div className="rpick__empty">Aucun acteur trouvé.</div>
        )}
        {!loading &&
          results.map((actor, index) => (
            <button
              type="button"
              key={actor.id}
              className={`rpick__row${index === 0 ? ' is-hi' : ''}`}
              onClick={() => onPick(actor)}
            >
              <span className="rpick__main">
                <strong>{actor.displayName}</strong>
                <small>{[actor.firstName, actor.lastName].filter(Boolean).join(' ')}</small>
              </span>
              <span className="rpick__suggest">Lier cet acteur</span>
            </button>
          ))}
      </div>
      <div className="rpick__foot">
        <span>Recherche dans les acteurs visibles par votre organisation</span>
      </div>
    </div>
  );
}
