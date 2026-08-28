'use client';

import type { NameMatch } from '../../services/name-search';
import { NAME_MATCH_MIN_CHARS } from '../../services/name-search';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import { resolveTypeLabel } from '../../utils/labels';
import { cn } from '@/lib/utils';

export interface ExplorerSearchSuggestionsProps {
  /** Terme saisi, brut (non trimé) : le seuil de caractères est appliqué ici. */
  query: string;
  /** Le champ a le focus et l'utilisateur n'a pas fermé le menu (Échap). */
  open: boolean;
  /** Index survolé au clavier, -1 = aucune sélection. */
  activeIndex: number;
  onPick: (match: NameMatch) => void;
  /** Id du `role="listbox"` ; les options en dérivent (`${listboxId}-${index}`). */
  listboxId: string;
}

/**
 * Le menu n'existe que s'il a quelque chose à montrer : UNE règle, consommée à la
 * fois par ce composant (rendu) et par la TopBar (aria-expanded, clavier). Deux
 * copies de la même condition divergeraient au premier oubli — et un menu qui
 * s'affiche alors que l'input annonce `aria-expanded="false"` est un menu invisible
 * pour un lecteur d'écran.
 *
 * Pas d'état « aucun résultat » : ce menu est une AIDE à la navigation, pas un
 * compte rendu de recherche. La recherche complète, elle, rend déjà ce verdict.
 */
export function shouldShowSuggestions(open: boolean, query: string, matchCount: number): boolean {
  return open && query.trim().length >= NAME_MATCH_MIN_CHARS && matchCount > 0;
}

export function ExplorerSearchSuggestions({
  query,
  open,
  activeIndex,
  onPick,
  listboxId,
}: ExplorerSearchSuggestionsProps) {
  // Menu fermé ⇒ terme vide ⇒ requête désactivée en amont (seuil de caractères) :
  // on ne consomme pas de CPU serveur pour un menu que personne ne regarde.
  const { data: matches } = useNameMatchQuery(open ? query : '');

  if (!shouldShowSuggestions(open, query, matches.length)) {
    return null;
  }

  return (
    <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 overflow-hidden rounded-shellMd border border-line bg-surface shadow-m">
      <ul
        id={listboxId}
        role="listbox"
        aria-label="Concordances directes"
        className="m-0 max-h-[320px] list-none overflow-y-auto p-1"
      >
        {matches.map((match, index) => {
          const typeLabel = resolveTypeLabel(match.type);
          return (
            <li
              key={match.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              // `onMouseDown` + `preventDefault()`, JAMAIS `onClick` : le `blur` de
              // l'input part avant le `click` et démonterait le menu, donc le clic
              // n'atteindrait jamais la ligne. Annuler le défaut du mousedown garde
              // le focus sur l'input — ne pas « simplifier » en onClick.
              onMouseDown={(event) => {
                event.preventDefault();
                onPick(match);
              }}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2 py-1.5',
                index === activeIndex ? 'bg-surface2' : 'hover:bg-surface2',
              )}
            >
              {/* Même rendu que les cartes de l'Exploreur : image de fond sur une
                  boîte de taille fixe (pas de next/image ici non plus). */}
              <span
                aria-hidden
                className="h-9 w-9 flex-none rounded-[8px] bg-surface2 bg-cover bg-center"
                style={match.imageUrl ? { backgroundImage: `url(${match.imageUrl})` } : undefined}
              />
              <span className="flex min-w-0 flex-col">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[13px] font-semibold text-ink">{match.name}</span>
                  {match.status === 'draft' ? (
                    <span className="shrink-0 rounded-[5px] border border-line bg-bgTint px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-ink-3">
                      Brouillon
                    </span>
                  ) : null}
                </span>
                <span className="truncate text-[11px] text-ink-3">
                  {[typeLabel, match.city].filter(Boolean).join(' · ')}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="m-0 border-t border-line bg-bgTint px-3 py-1.5 text-[11px] text-ink-3">
        Entrée — lancer la recherche complète
      </p>
    </div>
  );
}
