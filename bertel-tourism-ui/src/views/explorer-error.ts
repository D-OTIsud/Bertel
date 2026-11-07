/**
 * Décision du bandeau de reprise d'erreur de l'Explorateur (impl. 3.3). Pure :
 * une requête en échec ne remplace PLUS toute la page (audit S10) — on affiche un
 * bandeau inline et on conserve la dernière donnée valide. Le message s'adapte à
 * la requête fautive (cartes = résultats, références = filtres).
 */
export interface ExplorerErrorBanner {
  title: string;
  description: string;
}

export function buildExplorerErrorBanner(
  cardsIsError: boolean,
  referencesIsError: boolean,
): ExplorerErrorBanner | null {
  if (!cardsIsError && !referencesIsError) {
    return null;
  }
  if (cardsIsError && referencesIsError) {
    return {
      title: "Chargement partiel de l'Explorateur",
      description:
        "Plusieurs requêtes n'ont pas abouti. Les dernières données valides restent affichées ; les filtres et la recherche fonctionnent toujours.",
    };
  }
  if (cardsIsError) {
    return {
      title: 'Mise à jour des résultats impossible',
      description:
        'Les dernières fiches chargées restent affichées. Les filtres et la recherche fonctionnent toujours.',
    };
  }
  return {
    title: 'Certains filtres indisponibles',
    description:
      "Les options de filtre n'ont pas pu se charger. Les résultats déjà affichés restent utilisables.",
  };
}
