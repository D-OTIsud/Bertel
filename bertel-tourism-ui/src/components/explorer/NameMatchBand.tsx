'use client';

import { useExplorerStore } from '../../store/explorer-store';
import { useUiStore } from '../../store/ui-store';
import { useNameMatchQuery } from '../../hooks/useNameMatchQuery';
import { NAME_MATCH_MIN_CHARS } from '../../services/name-search';
import { resolveTypeLabel } from '../../utils/labels';

/**
 * Bandeau « Concordances directes » en tête de la colonne de résultats
 * (spec 2026-08-26).
 *
 * Il répond à une gêne mesurée : la liste filtrée met ~2 s à arriver, alors que
 * retrouver UNE fiche par son nom coûte ~20 ms. Le bandeau montre ces fiches-là
 * tout de suite, pendant que la liste charge — et continue de les montrer après,
 * parce qu'un bandeau qui apparaît puis disparaît quand la liste arrive est un
 * scintillement, pas une aide.
 *
 * Il consomme le MÊME hook (donc la même clé de requête, donc le même cache
 * TanStack) que le menu de la barre de recherche : afficher les deux surfaces ne
 * coûte pas un second aller-retour.
 *
 * Autonome par construction : il lit le terme et l'ouverture de fiche lui-même,
 * pour que son insertion dans l'Exploreur reste un `<NameMatchBand />` nu — un
 * composant qui exigerait des props obligatoires devrait être recâblé dans chaque
 * vue qui l'accueille.
 */
export function NameMatchBand() {
  const search = useExplorerStore((state) => state.common.search);
  const openDrawer = useUiStore((state) => state.openDrawer);
  const trimmed = search.trim();
  const { data: matches } = useNameMatchQuery(trimmed);

  if (trimmed.length < NAME_MATCH_MIN_CHARS || matches.length === 0) {
    return null;
  }

  return (
    <div className="flex-none border-b border-line bg-bgTint px-3 py-2">
      <p className="m-0 mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
        Concordances directes ({matches.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {matches.map((match) => (
          <button
            key={match.id}
            type="button"
            // Ouvre la fiche SANS toucher aux filtres : c'est de la navigation.
            // L'URL `?fiche=` suit toute seule (mécanique D25).
            onClick={() => openDrawer(match.id)}
            className="flex min-w-0 max-w-full items-center gap-2 rounded-[8px] border border-line bg-surface px-2 py-1.5 text-left hover:bg-surface2"
          >
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
                {[resolveTypeLabel(match.type), match.city].filter(Boolean).join(' · ')}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
