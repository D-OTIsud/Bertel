import { useQuery } from '@tanstack/react-query';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName, type NameMatch } from '../services/name-search';
import { useDebouncedValue } from './useDebouncedValue';
import { useExplorerStore } from '../store/explorer-store';
import { useSessionStore } from '../store/session-store';
import { resolveExplorerStatuses } from '../utils/facets';
import { sessionQueryScopeKey } from '../app/session-query-cache';

/**
 * 150 ms, PAS les 250 ms de la requete lourde de l'Exploreur : c'est toute la
 * raison d'etre de ce chemin. Le RPC coute ~20 ms et rend une seule requete,
 * donc le resultat peut apparaitre quasi instantanement PENDANT la frappe,
 * la ou la liste filtree, elle, attend que l'utilisateur ait fini.
 */
const NAME_MATCH_DEBOUNCE_MS = 150;

const NAME_MATCH_STALE_TIME_MS = 30 * 1000;

const EMPTY_MATCHES: NameMatch[] = [];

export interface NameMatchQueryResult {
  data: NameMatch[];
  isFetching: boolean;
}

export type NameMatchScope = 'explorer' | 'global';

/**
 * Recherche par nom partagée par le menu et le bandeau de concordances.
 *
 * La clé commune porte le terme, les statuts et le périmètre autorisé : le menu,
 * son parent clavier et le bandeau partagent ainsi une seule requête.
 *
 * ECHEC SILENCIEUX assume : en cas d'erreur le hook rend `[]` (et `retry:
 * false`). C'est une aide a la navigation, jamais un resultat dont l'ecran
 * depend — la remonter en etat d'erreur ferait clignoter une alerte pendant la
 * frappe pour un service dont l'absence se voit deja (aucune suggestion).
 */
export function useNameMatchQuery(term: string, scope: NameMatchScope = 'explorer'): NameMatchQueryResult {
  const configuredStatuses = useExplorerStore((state) => state.common.statuses);
  const canEditObjects = useSessionStore((state) => state.canEditObjects);
  const sessionScope = useSessionStore((state) => JSON.stringify([
    sessionQueryScopeKey(state), state.adminRank, state.demoMode, state.isSandboxDiscovery,
    state.authAuthority?.epoch, state.authAuthority?.hydrated,
  ]));
  const statuses = scope === 'explorer' ? resolveExplorerStatuses(configuredStatuses, canEditObjects) : null;
  const scopeKey = JSON.stringify([scope, sessionScope, canEditObjects, statuses]);
  const debouncedTerm = useDebouncedValue(term, NAME_MATCH_DEBOUNCE_MS);
  const trimmed = debouncedTerm.trim();
  const enabled = trimmed.length >= NAME_MATCH_MIN_CHARS;

  const query = useQuery({
    queryKey: ['name-match', scopeKey, trimmed],
    queryFn: ({ signal }) => searchObjectsByName(trimmed, signal, statuses),
    enabled,
    staleTime: NAME_MATCH_STALE_TIME_MS,
    // Une autre frappe peut garder les noms précédents pendant le chargement.
    // Un changement de statut ou de droits doit les retirer immédiatement.
    placeholderData: (previous, previousQuery) => previousQuery?.queryKey[1] === scopeKey ? previous : undefined,
    retry: false,
  });

  return {
    data: enabled ? query.data ?? EMPTY_MATCHES : EMPTY_MATCHES,
    isFetching: query.isFetching,
  };
}
