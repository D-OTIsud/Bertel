import { getApiClient } from '../lib/supabase';

/** Ce que renvoie `api.rpc_reset_test_data()` — compté par le serveur, jamais estimé ici. */
export interface TestCorpusResetResult {
  /** Fiches supprimées (tout le corpus de test sauf l'ORG elle-même). */
  deleted: number;
  /** Fiches re-semées, et l'organisation visée. */
  reseeded: {
    objects: number;
    actors_created: number;
    org: string;
    per_type: number;
  };
}

/**
 * Vide et resème le corpus du bac à sable.
 *
 * La RPC est `SECURITY DEFINER` et porte DEUX gardes serveur : superuser plateforme,
 * et refus si l'organisation visée n'est pas `is_test_org`. Elle ne prend AUCUN
 * argument — la cible est constante côté serveur, donc rien de ce qui est envoyé
 * d'ici ne peut la pointer sur une organisation de production. Le bouton de
 * l'interface n'est qu'une commodité ; il ne porte aucune autorisation.
 */
export async function resetTestData(): Promise<TestCorpusResetResult> {
  const apiClient = getApiClient();
  if (!apiClient) {
    throw new Error('Client API indisponible.');
  }
  const { data, error } = await apiClient.schema('api').rpc('rpc_reset_test_data');
  if (error) {
    throw new Error(error.message);
  }
  return data as TestCorpusResetResult;
}
