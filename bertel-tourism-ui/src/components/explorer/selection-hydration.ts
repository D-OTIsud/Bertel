/**
 * §125 bis — quelles fiches SÉLECTIONNÉES manquent à la fenêtre paginée de la liste ?
 *
 * La liste des résultats est paginée paresseusement (50 lignes par bucket et par page)
 * alors que la CARTE ne l'est pas : elle affiche d'un coup tout le corpus filtré
 * (`useExplorerMarkersQuery`). Une sélection faite sur la carte — lasso, « tout
 * sélectionner », clic sur un marqueur — désigne donc régulièrement des fiches qui ne
 * sont pas encore dans la fenêtre chargée. Le flottement en tête de `ResultsList` ne
 * pouvait pas les remonter (il ne réordonne que ce qui est déjà chargé) : elles
 * restaient invisibles jusqu'à ce que l'utilisateur scrolle jusqu'à elles.
 *
 * On les RÉCLAME donc explicitement, au lieu d'attendre que la pagination y arrive.
 */

/**
 * Plafond de réclamation. `api.get_object_cards_batch` coûte ~0.43 s pour 200 ids et
 * ~1.7 s pour 1000 (mesuré en prod le 04/09/2026) — or le rôle `authenticated` porte un
 * `statement_timeout` de 8 s que l'Exploreur a déjà fait sauter une fois (incident
 * 2026-08-07). « Tout sélectionner » peut désigner des milliers de fiches : on borne.
 * Au-delà, les premières de la sélection remontent, les suivantes arrivent au scroll.
 */
export const SELECTION_HYDRATION_LIMIT = 200;

export interface SelectionHydrationInput {
  /** Le panier de sélection, dans son ordre d'ajout (il porte le flottement en tête). */
  selectedObjectIds: string[];
  /** Fiche cliquée sur un marqueur (`selectCard`) — la liste doit pouvoir y défiler. */
  selectedCardId: string | null;
  /** Ids déjà rendus par la fenêtre paginée. */
  loadedCardIds: Iterable<string>;
  /**
   * Corpus filtré courant = les marqueurs (`visibleObjectIds`). L'intersection est ce qui
   * empêche de réinjecter une sélection DEVENUE hors-filtre : elle survit volontairement
   * aux changements de filtres (D25), mais la liste des résultats ne doit montrer que ce
   * qui correspond aux filtres actifs. Vide = corpus encore inconnu ⇒ on ne réclame rien.
   */
  corpusObjectIds: Iterable<string>;
  /** Faux quand la liste est groupée en sections : le flottement y est suspendu. */
  enabled: boolean;
}

/**
 * Ids à réclamer, dans l'ordre d'affichage voulu : la fiche cliquée d'abord (c'est celle
 * que l'utilisateur vient de désigner), puis le panier dans son ordre d'ajout.
 */
export function resolveSelectionHydrationIds({
  selectedObjectIds,
  selectedCardId,
  loadedCardIds,
  corpusObjectIds,
  enabled,
}: SelectionHydrationInput): string[] {
  if (!enabled) {
    return [];
  }

  const loaded = new Set(loadedCardIds);
  const corpus = new Set(corpusObjectIds);
  if (corpus.size === 0) {
    return [];
  }

  const wanted = selectedCardId ? [selectedCardId, ...selectedObjectIds] : selectedObjectIds;
  const missing: string[] = [];
  const seen = new Set<string>();

  for (const id of wanted) {
    if (missing.length >= SELECTION_HYDRATION_LIMIT) {
      break;
    }
    if (!id || seen.has(id) || loaded.has(id) || !corpus.has(id)) {
      continue;
    }
    seen.add(id);
    missing.push(id);
  }

  return missing;
}
