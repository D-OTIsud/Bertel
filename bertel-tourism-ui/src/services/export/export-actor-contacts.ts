import { CLOSED_ACTOR_CAPS, type ActorCapabilities, type ActorContactChannel, type ActorContactsRow } from './export-columns';
import { chunkIds } from './export-fetch';
import { callExportActorContactsRpc, getExportActorCapabilitiesResult } from '../rpc';

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

function toChannel(raw: Record<string, unknown>): ActorContactChannel {
  return {
    kindCode: String(raw.kind_code ?? ''),
    kindName: String(raw.kind_name ?? ''),
    value: String(raw.value ?? ''),
    isPrimary: raw.is_primary === true,
  };
}

function toRow(raw: Record<string, unknown>): ActorContactsRow {
  return {
    objectId: String(raw.object_id ?? ''),
    displayName: String(raw.display_name ?? ''),
    roleName: String(raw.role_name ?? ''),
    isPrimary: raw.is_primary === true,
    note: String(raw.note ?? ''),
    contacts: Array.isArray(raw.contacts) ? (raw.contacts as Record<string, unknown>[]).map(toChannel) : [],
  };
}

/**
 * Corrélateur d'un export multi-lots, partagé par toutes ses lignes de journal.
 *
 * `crypto.randomUUID` n'existe QUE en contexte sécurisé (et pas avant Safari 15.4) : en HTTP
 * simple il vaut `undefined` et l'export mourait sur un `TypeError` illisible, SANS fichier —
 * panne qu'aucun test ne pouvait voir (jest.setup.ts polyfille la méthode). D'où le repli.
 *
 * LE FORMAT N'EST PAS LIBRE — c'est le piège que le repli d'origine (`run-<base36>-<base36>`)
 * avait manqué : `api.export_actor_contacts.p_export_run_id` est de type **uuid** (vérifié via
 * `pg_get_function_arguments`), donc PostgreSQL rejette toute chaîne non-UUID en **22P02 dès la
 * PLANIFICATION** — avant toute exécution. La conséquence n'est pas « le journal perd son
 * corrélateur » mais « l'export ENTIER échoue », y compris le premier lot : le repli censé
 * sauver le contexte non sécurisé le condamnait à coup sûr. Toute valeur rendue ici DOIT donc
 * être un UUID v4 syntaxiquement valide.
 *
 * En revanche la QUALITÉ de l'aléa reste secondaire : la valeur est une ASSERTION DE L'APPELANT
 * servant à recoller les lots entre eux, jamais une preuve (le journal serveur est la seule
 * pièce probante). D'où la dégradation en trois étages — `randomUUID`, puis `getRandomValues`
 * (bien plus largement disponible, et présent hors contexte sécurisé), puis `Math.random` en
 * dernier recours : on accepte un aléa faible, jamais un format invalide.
 */
function newExportRunId(): string {
  const webCrypto = globalThis.crypto;
  if (typeof webCrypto?.randomUUID === 'function') return webCrypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof webCrypto?.getRandomValues === 'function') webCrypto.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4 — sinon la valeur n'est pas un UUID *v4*
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variante RFC 4122 (8/9/a/b)
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * §208/R1 — SEULE voie de lecture des coordonnées d'acteur pour l'export : l'appel
 * journalisé api.export_actor_contacts (16t, via callExportActorContactsRpc). Les colonnes
 * requiresPurpose du registre ne lisent QUE le résultat de cette fonction — jamais la fiche
 * batch (le journal serait contournable). Tous les lots partagent un export_run_id GÉNÉRÉ
 * CLIENT ; chaque lot a sa propre ligne de journal (logId). Fusion par object_id (un id peut,
 * en théorie, apparaître dans deux lots si l'appelant a mal dédoublonné — peu probable ici
 * puisque `clean` dédoublonne déjà, mais la fusion reste additive et non écrasante).
 * Un lot en échec ⇒ throw : l'orchestrateur (runSelectionXlsxExport) ne produit AUCUN fichier
 * (les journaux des lots déjà réussis restent — la donnée a atteint le navigateur, le journal
 * dit la vérité ; seul le classeur final n'est jamais écrit sur un échec partiel).
 */
export async function exportActorContacts(
  ids: string[],
  purpose: string,
  opts: { batchSize?: number; signal?: AbortSignal } = {},
): Promise<ActorContactsExportResult> {
  const cleanPurpose = purpose.trim();
  if (cleanPurpose.length < 5) {
    throw new Error("La finalité de l'export est obligatoire (5 caractères minimum — elle est inscrite au journal).");
  }
  const size = opts.batchSize ?? ACTOR_EXPORT_BATCH;
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const exportRunId = newExportRunId();
  const batchCount = Math.max(1, Math.ceil(clean.length / size));

  const rows = new Map<string, ActorContactsRow[]>();
  const logIds: string[] = [];
  const authorized = new Set<string>();
  const denied = new Set<string>();

  for (let i = 0; i < clean.length; i += size) {
    if (opts.signal?.aborted) throw new Error('Export annulé.');
    const chunk = clean.slice(i, i + size);
    const result = await callExportActorContactsRpc(chunk, cleanPurpose, {
      exportRunId,
      batchIndex: Math.floor(i / size) + 1,
      batchCount,
    }, { signal: opts.signal });
    if (result.log_id) logIds.push(result.log_id);
    result.authorized_object_ids.forEach((id) => authorized.add(id));
    result.denied_object_ids.forEach((id) => denied.add(id));
    for (const rawRow of result.rows) {
      const row = toRow(rawRow as Record<string, unknown>);
      if (!row.objectId) continue;
      rows.set(row.objectId, [...(rows.get(row.objectId) ?? []), row]);
    }
  }
  return {
    rows,
    exportRunId,
    logIds,
    authorizedObjectIds: [...authorized],
    deniedObjectIds: [...denied],
  };
}
