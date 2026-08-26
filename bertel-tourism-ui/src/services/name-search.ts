import { getApiClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

/** Une fiche trouvee par son NOM — juste de quoi la reconnaitre et y aller. */
export interface NameMatch {
  id: string;
  name: string;
  type: string;
  status: string;
  city: string | null;
  imageUrl: string | null;
}

export const NAME_MATCH_MIN_CHARS = 2;

/** Plafond serveur : le RPC borne lui-meme p_limit a 1..20. */
const NAME_MATCH_LIMIT = 8;

interface NameMatchRow {
  id?: unknown;
  name?: unknown;
  object_type?: unknown;
  status?: unknown;
  city?: unknown;
  image_url?: unknown;
}

/**
 * Recherche par NOM dans tout le corpus visible — c'est de la NAVIGATION
 * (« je veux LA fiche »), pas du filtrage : le resultat ignore volontairement
 * les filtres de l'Exploreur, sinon la fiche cherchee resterait invisible
 * derriere un filtre pose plus tot.
 *
 * Pourquoi un service dedie plutot que le chemin existant :
 * - `api.search_objects_by_name` est un RPC LEGER (~20 ms mesure) et rend UNE
 *   requete, la ou la recherche de l'Exploreur en declenche 14 (une par bucket)
 *   sur des payloads de carte complets ;
 * - il ne renvoie que ce qu'il faut pour reconnaitre la fiche, donc rien a
 *   normaliser ni a deduper.
 *
 * Le PERIMETRE est auto-garde COTE SERVEUR (publie pour tous, + les brouillons
 * du perimetre etendu pour un editeur) : ce client ne resout donc AUCUN statut
 * ni perimetre — ne rien ajouter ici, ce serait une seconde source de verite.
 */
export async function searchObjectsByName(term: string, signal?: AbortSignal): Promise<NameMatch[]> {
  const trimmed = term.trim();
  if (trimmed.length < NAME_MATCH_MIN_CHARS) {
    return [];
  }

  // Mode demo : pas de corpus a interroger (aucun mock n'adosse ce RPC).
  // Sans client Supabase configure, meme conclusion — l'aide a la navigation
  // s'efface, elle ne fait pas echouer l'ecran.
  const session = useSessionStore.getState();
  const client = session.demoMode ? null : getApiClient();
  if (!client) {
    return [];
  }

  const { data, error } = await withAbort(
    client.schema('api').rpc('search_objects_by_name', {
      p_term: trimmed,
      p_limit: NAME_MATCH_LIMIT,
    }),
    signal,
  );

  if (error) {
    throw error;
  }

  return normalizeNameMatches(data);
}

function normalizeNameMatches(data: unknown): NameMatch[] {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((row: NameMatchRow | null) => {
    const id = row?.id;
    // Une ligne sans identifiant n'est pas navigable : on l'ignore plutot que
    // de rendre une entree sur laquelle cliquer ne menerait nulle part.
    if (typeof id !== 'string' || id.length === 0) {
      return [];
    }
    return [
      {
        id,
        name: typeof row?.name === 'string' ? row.name : '',
        type: row?.object_type != null ? String(row.object_type) : '',
        status: row?.status != null ? String(row.status) : '',
        city: row?.city != null ? String(row.city) : null,
        imageUrl: row?.image_url != null ? String(row.image_url) : null,
      },
    ];
  });
}

/**
 * Branche le signal d'abandon de TanStack Query sur le builder PostgREST quand
 * celui-ci l'accepte : une frappe suivante doit ARRETER la requete precedente,
 * sinon elle continue de consommer du CPU serveur pour un resultat que plus
 * personne n'affichera (incident 2026-08-07).
 *
 * ponytail: copie du helper prive homonyme de `rpc.ts` (non exporte, et ce
 * fichier-la n'est pas dans le perimetre de cette passe). A fusionner en un
 * seul helper partage a la premiere occasion de toucher `rpc.ts`.
 */
function withAbort<T extends PromiseLike<unknown>>(builder: T, signal?: AbortSignal): T {
  if (!signal) {
    return builder;
  }
  const withSignal = builder as T & { abortSignal?: (s: AbortSignal) => T };
  return typeof withSignal.abortSignal === 'function' ? withSignal.abortSignal(signal) : builder;
}
