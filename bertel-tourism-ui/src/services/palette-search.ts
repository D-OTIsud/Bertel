import type { ObjectCard } from '../types/domain';
import { listObjectMarkers } from './rpc';
import { useSessionStore } from '../store/session-store';
import { DEFAULT_EXPLORER_FILTERS, resolveExplorerStatuses } from '../utils/facets';

export const PALETTE_SEARCH_MIN_CHARS = 2;
const PALETTE_SEARCH_LIMIT = 8;

/**
 * D24 — recherche d'objets de la palette ⌘K : réutilise le RPC markers
 * (authorize-once, corpus complet en ~100 ms, cf. §125) avec les filtres par
 * défaut + le terme — c'est le tsvector `object.search_document` qui matche.
 * Statuts résolus comme l'Explorer : un éditeur retrouve aussi ses brouillons.
 * ponytail: le RPC markers ne renvoie que les fiches GÉOLOCALISÉES — une fiche
 * sans coordonnées n'est pas trouvable ici ; le propre est un RPC de recherche
 * léger dédié (remonté à la session API).
 */
export async function searchPaletteObjects(query: string): Promise<ObjectCard[]> {
  const trimmed = query.trim();
  if (trimmed.length < PALETTE_SEARCH_MIN_CHARS) {
    return [];
  }
  const canEditObjects = useSessionStore.getState().canEditObjects;
  const filters = {
    ...DEFAULT_EXPLORER_FILTERS,
    common: {
      ...DEFAULT_EXPLORER_FILTERS.common,
      search: trimmed,
      statuses: resolveExplorerStatuses([], canEditObjects),
    },
  };
  const markers = await listObjectMarkers(filters);
  return markers.slice(0, PALETTE_SEARCH_LIMIT);
}
