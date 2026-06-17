import { useEffect, useState } from 'react';
import { Link2, Mail, Search } from 'lucide-react';
import { searchActors, type ActorSearchResult } from '../../../services/object-workspace';

interface ActorPickerProps {
  onPick: (actor: ActorSearchResult) => void;
}

const CIVILITY_RE = /^(mme|mlle|m\.?|mr|monsieur|madame)\s+/i;

/** Avatar initials: prénom+nom, sinon le displayName privé de la civilité. */
function actorInitials(actor: ActorSearchResult): string {
  const fromNames = `${actor.firstName.trim()[0] ?? ''}${actor.lastName.trim()[0] ?? ''}`.toUpperCase();
  if (fromNames) return fromNames;
  const bare = actor.displayName.replace(CIVILITY_RE, '').trim();
  return bare.slice(0, 2).toUpperCase() || '?';
}

/**
 * §48/§95b — actor search picker for §19 (prestataires). Searches via api.search_actors
 * (SECURITY DEFINER, editor-gated; §95 broadened to the full directory for any editor and now
 * returns the primary e-mail). 300ms debounce, min 2 characters. Each result is a rich row:
 * avatar (initials) + civilité/nom/prénom (displayName) + e-mail, with an explicit "Lier" button.
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
        <span className="rpick__icon" aria-hidden><Search size={15} /></span>
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
          results.map((actor) => (
            <div key={actor.id} className="actor-opt">
              <span className="actor-opt__avatar" aria-hidden>{actorInitials(actor)}</span>
              <span className="actor-opt__id">
                <strong className="actor-opt__name">{actor.displayName}</strong>
                {actor.email ? (
                  <span className="actor-opt__email">
                    <Mail size={12} aria-hidden />
                    <span className="actor-opt__email-val">{actor.email}</span>
                  </span>
                ) : (
                  <span className="actor-opt__email actor-opt__email--empty">Aucun e-mail renseigné</span>
                )}
              </span>
              <button
                type="button"
                className="actor-opt__link"
                aria-label={`Lier ${actor.displayName}`}
                onClick={() => onPick(actor)}
              >
                <Link2 size={14} aria-hidden /> Lier
              </button>
            </div>
          ))}
      </div>
      <div className="rpick__foot">
        <span>Recherche dans l&apos;annuaire des acteurs (éditeurs)</span>
      </div>
    </div>
  );
}
