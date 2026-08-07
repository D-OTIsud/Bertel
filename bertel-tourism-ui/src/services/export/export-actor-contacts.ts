import { CLOSED_ACTOR_CAPS, type ActorCapabilities, type ActorContactsRow } from './export-columns';
import { chunkIds } from './export-fetch';
import { getExportActorCapabilitiesResult } from '../rpc';

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
 * FAIL-CLOSED (corrigé revue 4e vague) — `getExportActorCapabilities` (single-call,
 * rpc.ts) ne rejette JAMAIS : elle avale toute erreur PostgREST/réseau/client-absent et
 * rend un verdict {false,false}, contrat single-call INTACT et non touché ici. Ce
 * verdict fermé était donc INDISTINGUABLE d'un échec de lot — le découpage ci-dessous
 * réduisait par OR même sur un lot en échec, laissant les lots accordés l'emporter
 * (agrégat PARTIEL présenté comme un verdict). Le correctif consomme la variante bas
 * niveau `getExportActorCapabilitiesResult`, dont le champ `ok` distingue RÉELLEMENT
 * un échec (`{ok:false}`) d'un verdict fermé légitime (`{ok:true, caps:{false,false}}`) :
 * `!result.ok` abandonne IMMÉDIATEMENT la boucle et renvoie les capacités closes, sans
 * OR-er les lots déjà accordés. Jamais d'agrégat partiel présenté comme un verdict.
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
    if (opts.isStale?.()) return { ...CLOSED_ACTOR_CAPS };
    const result = await getExportActorCapabilitiesResult(chunk);
    if (opts.isStale?.()) return { ...CLOSED_ACTOR_CAPS };
    // Un lot en ÉCHEC (client absent, erreur PostgREST, exception) n'est pas un verdict
    // {false,false} : abandonner ici évite de le faire contribuer `false` puis de laisser
    // un lot suivant l'OR-er en un agrégat partiel présenté comme un verdict complet.
    if (!result.ok) return { ...CLOSED_ACTOR_CAPS };
    identity = identity || result.caps.actorIdentityAvailable;
    contacts = contacts || result.caps.actorContactsAvailable;
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
