import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName, type NameMatch } from '../services/name-search';
import { useDebouncedValue } from './useDebouncedValue';

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

/**
 * Recherche par nom partagee par les TROIS surfaces qui la consomment (menu
 * sous la barre de recherche, bandeau de resultats, palette ⌘K).
 *
 * La `queryKey` ne porte que le terme trime : elle est donc COMMUNE aux trois
 * surfaces, qui se servent du meme cache — trois surfaces ouvertes sur le meme
 * terme = une seule requete reseau.
 *
 * ECHEC SILENCIEUX assume : en cas d'erreur le hook rend `[]` (et `retry:
 * false`). C'est une aide a la navigation, jamais un resultat dont l'ecran
 * depend — la remonter en etat d'erreur ferait clignoter une alerte pendant la
 * frappe pour un service dont l'absence se voit deja (aucune suggestion).
 */
export function useNameMatchQuery(term: string): NameMatchQueryResult {
  const debouncedTerm = useDebouncedValue(term, NAME_MATCH_DEBOUNCE_MS);
  const trimmed = debouncedTerm.trim();
  const enabled = trimmed.length >= NAME_MATCH_MIN_CHARS;

  const query = useQuery({
    queryKey: ['name-match', trimmed],
    queryFn: ({ signal }) => searchObjectsByName(trimmed, signal),
    enabled,
    staleTime: NAME_MATCH_STALE_TIME_MS,
    placeholderData: keepPreviousData,
    retry: false,
  });

  return {
    data: query.data ?? EMPTY_MATCHES,
    isFetching: query.isFetching,
  };
}
