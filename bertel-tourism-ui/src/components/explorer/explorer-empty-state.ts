import type { ExplorerFilters } from '../../types/domain';
import { DEFAULT_EXPLORER_FILTERS } from '../../utils/facets';
import { useExplorerStore } from '../../store/explorer-store';
import { buildExplorerActiveChips } from './explorer-active-chips';

/** Domaines de taxonomie porteurs d'une nature d'hébergement (§201). */
const ACCOMMODATION_TAXONOMY_DOMAINS = new Set([
  'taxonomy_hot',
  'taxonomy_hlo',
  'taxonomy_rva',
  'taxonomy_camp',
  'taxonomy_hpa',
]);

export interface ExplorerEmptyStateCopy {
  title: string;
  description: string;
}

const GENERIC: ExplorerEmptyStateCopy = {
  title: 'Aucun résultat pour ces filtres',
  description: "Essayez d'élargir la recherche ou de relâcher les contraintes (carte, statuts, équipements).",
};

/**
 * §201 — état vide explicite pour une nature d'hébergement encore inutilisée.
 *
 * POURQUOI : la v2 crée des natures que personne ne porte encore (aire de
 * bivouac, halte nocturne, PRL…). Elles restent visibles à dessein — elles
 * montrent le modèle cible et servent à la saisie. Mais un agent qui en
 * sélectionne une et lit « Aucun résultat pour ces filtres » conclut au bug.
 *
 * PRUDENCE : sans compteur par nature (le lot 3 s'interdit un nouvel endpoint),
 * on ne peut affirmer « personne ne l'utilise » que si la nature est le SEUL
 * critère restrictif. Dès qu'une recherche textuelle ou un autre filtre
 * s'ajoute, le vide peut venir d'ailleurs : on retombe alors sur le message
 * générique plutôt que d'affirmer quelque chose de faux.
 */
export function resolveExplorerEmptyState(filters: ExplorerFilters): ExplorerEmptyStateCopy {
  const taxonomy = filters.common.taxonomyAny ?? [];
  // `bucket` / `status` / `hotSubtypes` sont le CADRE dans lequel la nature est
  // choisie, pas un critère supplémentaire — sélectionner une nature peut même
  // ré-inclure son type technique. Tout le reste rend le diagnostic incertain.
  const hasOtherActiveFilters = buildExplorerActiveChips(filters)
    .some((chip) => !['taxonomy', 'bucket', 'status', 'hotSubtypes'].includes(chip.group));

  const isLoneAccommodationNature =
    taxonomy.length === 1
    && ACCOMMODATION_TAXONOMY_DOMAINS.has(taxonomy[0].domain)
    && !hasOtherActiveFilters;

  if (!isLoneAccommodationNature) {
    return GENERIC;
  }

  return {
    title: "Aucune fiche n'utilise encore cette nature d'hébergement",
    description:
      "La nature existe dans le catalogue et peut être choisie à la création d'une fiche. Aucun établissement ne la porte pour l'instant.",
  };
}

/** Assemble l'état de filtres du store et en dérive la copie d'état vide. */
export function useExplorerEmptyState(): ExplorerEmptyStateCopy {
  const common = useExplorerStore((state) => state.common);
  const selectedBuckets = useExplorerStore((state) => state.selectedBuckets);
  const hot = useExplorerStore((state) => state.hot);
  const res = useExplorerStore((state) => state.res);
  const iti = useExplorerStore((state) => state.iti);
  const vis = useExplorerStore((state) => state.vis);
  const srv = useExplorerStore((state) => state.srv);
  const evt = useExplorerStore((state) => state.evt);
  return resolveExplorerEmptyState({
    ...DEFAULT_EXPLORER_FILTERS,
    common, selectedBuckets, hot, res, iti, vis, srv, evt,
  });
}
