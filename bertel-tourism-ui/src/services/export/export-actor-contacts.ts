import { CLOSED_ACTOR_CAPS, type ActorCapabilities, type ActorContactsRow } from './export-columns';
import { chunkIds } from './export-fetch';
import { getExportActorCapabilities } from '../rpc';

export const ACTOR_EXPORT_BATCH = 500; // plafond PAR APPEL du RPC (16t) — au-delà on découpe : N lignes de journal, pas une. Aucun plafond fonctionnel d'export (R1).

/**
 * R2 (revue 3e vague) — PRÉFLIGHT des capacités acteur, découpé EXACTEMENT comme
 * l'export lui-même. `api.export_actor_capabilities` refuse au-delà de
 * ACTOR_EXPORT_BATCH ids après dédoublonnage (BATCH_TOO_LARGE, SQLSTATE 22023) :
 * ce plafond borne un fan-out par id sur un point d'entrée PostgREST-exécutable,
 * il est correct et n'est pas négociable. Mais son unique appelant — la modale
 * d'export — passait la sélection ENTIÈRE, or l'Exploreur sait sélectionner tout
 * le corpus publié (~840 fiches) : le préflight levait 22023, la modale refermait
 * les capacités, et les colonnes acteur n'étaient tout simplement PAS offertes —
 * sans le moindre signal — pour un export que le système est explicitement
 * construit pour faire (cf. ACTOR_EXPORT_BATCH ci-dessus). C'est donc l'APPELANT
 * qui découpe, avec LA MÊME constante : une seule source de vérité pour la taille
 * de lot, jamais un second littéral qui dériverait du plafond serveur.
 *
 * RÉDUCTION PAR `OR` — une capacité est disponible dès qu'UN lot l'accorde. Ce
 * n'est pas une approximation : les deux clés du RPC sont des `EXISTS` sur
 * l'ensemble d'ids reçu, et `EXISTS(A ∪ B) = EXISTS(A) OR EXISTS(B)`. Découper
 * puis OR-er rend donc EXACTEMENT ce qu'un appel unique non plafonné aurait rendu.
 *
 * SÉQUENTIEL, et non la concurrence 2 de `fetchResourceBatches` — choix assumé :
 * (a) le corpus publié entier ne fait que 2 lots, donc la concurrence n'achèterait
 * rien de mesurable ; (b) le préflight n'ouvre qu'une OFFRE de colonnes, il ne
 * bloque ni le rendu de la modale ni l'export ; (c) `api.can_read_actor_contacts`
 * est SECURITY DEFINER donc non inlinable (coût par id) — poser deux sondes de 500
 * ids en parallèle doublerait le pic de charge SQL pour une réponse purement
 * ergonomique. Un seul lot en vol à la fois est aussi ce qui rend l'interruption
 * ci-dessous trivialement correcte.
 *
 * FAIL-CLOSED — le rejet d'un lot N'EST PAS avalé : il remonte, l'appelant referme
 * TOUTES les capacités. Jamais d'agrégat partiel présenté comme un verdict.
 *
 * INTERRUPTION — `isStale` est consulté AVANT chaque lot et APRÈS chaque réponse :
 * dès qu'une sélection en remplace une autre, plus aucun lot n'est posé et le
 * verdict rendu est FERMÉ (et non l'agrégat partiel), pour qu'un appelant qui
 * oublierait sa propre garde échoue quand même du bon côté.
 */
export async function fetchActorExportCapabilities(
  ids: string[],
  opts: { isStale?: () => boolean } = {},
): Promise<ActorCapabilities> {
  let identity = false;
  let contacts = false;
  // chunkIds dédoublonne et écarte les ids vides — le même nettoyage que le serveur
  // refait de son côté avant de compter contre son plafond.
  for (const chunk of chunkIds(ids, ACTOR_EXPORT_BATCH)) {
    if (opts.isStale?.()) return CLOSED_ACTOR_CAPS;
    const caps = await getExportActorCapabilities(chunk);
    if (opts.isStale?.()) return CLOSED_ACTOR_CAPS;
    identity = identity || caps.actorIdentityAvailable;
    contacts = contacts || caps.actorContactsAvailable;
  }
  return { actorIdentityAvailable: identity, actorContactsAvailable: contacts };
}

/** R1 — résultat AGRÉGÉ des lots : tous partagent un export_run_id ; chaque lot a son logId ; les refus sont nommés. */
export interface ActorContactsExportResult {
  rows: Map<string, ActorContactsRow[]>;
  exportRunId: string;
  logIds: string[];
  authorizedObjectIds: string[];
  deniedObjectIds: string[];
}

export async function exportActorContacts(
  _ids: string[],
  _purpose: string,
  _opts: { batchSize?: number; signal?: AbortSignal } = {},
): Promise<ActorContactsExportResult> {
  // Tâche 16 branche le RPC api.export_actor_contacts (migration 16t). D'ici là :
  // refuser explicitement plutôt que rendre un export silencieusement vide.
  throw new Error("Export des coordonnées d'acteur indisponible (migration 16t non déployée).");
}
