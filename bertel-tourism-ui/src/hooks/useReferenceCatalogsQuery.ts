import { useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query';
import { fetchReferenceCatalogs, type ReferenceCatalogs } from '../services/reference-catalogs';
import { fetchThesaurusGeneration } from '../services/thesaurus-generation';
import { generationQueryKey, THESAURUS_GENERATION_QUERY_KEY, useThesaurusGeneration } from './useThesaurusGeneration';

export const REFERENCE_CATALOGS_QUERY_KEY = ['reference-catalogs', 2] as const;

/**
 * Les catalogues `ref_*` sont IDENTIQUES pour toutes les fiches et pour tous les
 * utilisateurs (tables en lecture publique). Ils etaient retelecharges a chaque
 * ouverture de fiche : ~43 requetes sur les ~85 mesurees.
 *
 * `staleTime` d'une heure, PAS `Infinity` : les chemins d'enregistrement
 * resolvent des codes vers des identifiants depuis ces catalogues, donc un
 * catalogue trop vieux ferait rater un code fraichement ajoute par un
 * administrateur. L'editeur de `ref_code` invalide en plus cette cle
 * explicitement (voir RefCatalogAdmin).
 *
 * `meta.persist` fait retenir l'entree par le persisteur localStorage
 * (Providers.tsx) : apres un rechargement de page, 0 requete de catalogue.
 *
 * NE JAMAIS y ajouter une donnee soumise a la RLS (par exemple la liste des
 * ORG) : ce cache est partage entre tous les utilisateurs du navigateur.
 */
const CATALOGS_STALE_TIME_MS = 60 * 60 * 1000;
const CATALOGS_GC_TIME_MS = 24 * 60 * 60 * 1000;

export function useReferenceCatalogsQuery(): UseQueryResult<ReferenceCatalogs> {
  const generation = useThesaurusGeneration();
  return useQuery({
    queryKey: generationQueryKey(REFERENCE_CATALOGS_QUERY_KEY, generation),
    queryFn: () => { if (generation.isError) throw generation.error; return fetchReferenceCatalogs(); },
    enabled: !generation.isPending,
    staleTime: CATALOGS_STALE_TIME_MS,
    gcTime: CATALOGS_GC_TIME_MS,
    meta: { persist: true },
  });
}

/**
 * Variante imperative pour le chargeur de l'editeur, qui n'est pas un composant
 * React.
 *
 * ATTENTION — utiliser `fetchQuery`, PAS `ensureQueryData`. Verifie dans la
 * version installee (@tanstack/query-core 5.100.7, `queryClient.ts`) :
 * `ensureQueryData` rend la valeur en cache DES QUE `data !== undefined`, sans
 * regarder `staleTime` ; l'option `revalidateIfStale` ne fait que lancer un
 * prefetch d'arriere-plan et rend QUAND MEME la valeur perimee. Combine a la
 * persistance localStorage (gcTime 24 h), un catalogue vieux de 24 h serait
 * servi tel quel et le contrat « rafraichi toutes les heures » serait faux.
 *
 * `fetchQuery({ staleTime })` a la semantique voulue : rend le cache s'il est
 * frais AU SENS DE `staleTime`, refetch sinon et attend le resultat.
 * `useReferenceCatalogsQuery.test.tsx` verifie les deux bras (59 min / 61 min) —
 * revenir a `ensureQueryData` fait tomber le second.
 */
export async function ensureReferenceCatalogs(queryClient: QueryClient): Promise<ReferenceCatalogs> {
  const generation = await queryClient.fetchQuery({ queryKey: THESAURUS_GENERATION_QUERY_KEY,
    queryFn: fetchThesaurusGeneration, staleTime: 0, meta: { persist: false } });
  return queryClient.fetchQuery({
    queryKey: generation == null ? [...REFERENCE_CATALOGS_QUERY_KEY] : [...REFERENCE_CATALOGS_QUERY_KEY, generation],
    queryFn: fetchReferenceCatalogs,
    staleTime: CATALOGS_STALE_TIME_MS,
    gcTime: CATALOGS_GC_TIME_MS,
    meta: { persist: true },
  });
}
