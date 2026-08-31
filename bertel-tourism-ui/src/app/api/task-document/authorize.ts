import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// Socle d'AUTORISATION partagé par les trois verbes de /api/task-document (upload, URL
// signée, suppression). Il existe pour une raison précise : le gate et la résolution du
// document lié étaient recopiés verbatim dans route.ts et url/route.ts. Deux copies d'un
// gate, c'est deux endroits où se tromper — et un correctif appliqué à l'une laisse
// l'autre ouverte en silence, sans qu'aucun test ne rougisse. Une seule définition ici.
//
// Périmètre volontairement étroit : authentifier l'appelant, évaluer le prédicat
// d'écriture, résoudre le document RATTACHÉ à la tâche. Rien d'autre — le traitement de
// fichier, les rollbacks et les formes de réponse métier restent dans chaque route.

/** Bucket privé UNIQUE des pièces jointes de tâche. Voir `resolveLinkedDocument` : rien
 *  d'autre que cette constante ne doit jamais désigner un bucket pour signer/supprimer. */
export const PRIVATE_BUCKET = 'actor-documents';

export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type ServerClient = NonNullable<ReturnType<typeof getServerSupabaseClient>>;

export function bearer(req: NextRequest): string {
  const value = req.headers.get('authorization') ?? '';
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

// Client « en tant qu'appelant » : porte le JWT de session, jamais la service key. Sert
// uniquement à évaluer le RPC SECURITY DEFINER de gate — RLS sur crm_task_document et
// ref_document bloque de toute façon la lecture/écriture directe par ce client.
function callerClient(jwt: string) {
  return createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
}

// Prédicat d'écriture UNIQUE pour les trois verbes (upload, url signée, delete) : la spec
// assume que toute surface de pièce jointe de tâche vit derrière le modal d'édition, lui-même
// gated en écriture. Tâche inconnue ⇒ false côté RPC, jamais une erreur qui fuiterait.
export async function authorizeTask(jwt: string, taskId: string): Promise<boolean> {
  const { data, error } = await callerClient(jwt).schema('api').rpc(
    'user_can_write_crm_task', { p_task_id: taskId });
  return !error && data === true;
}

export type AuthenticatedRequest =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      server: ServerClient;
      jwt: string;
      userId: string;
    };

export async function authenticated(req: NextRequest): Promise<AuthenticatedRequest> {
  const server = getServerSupabaseClient();
  if (!server) return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 500 }) };
  const jwt = bearer(req);
  if (!jwt) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const { data, error } = await server.auth.getUser(jwt);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  return { ok: true, server, jwt, userId: data.user.id };
}

/** Résultat de `resolveLinkedDocument`. `file: null` = la ligne existe mais ne désigne
 *  aucun fichier exploitable (purge manuelle, incident d'upload) : à chaque appelant de
 *  décider — la suppression tolère, l'URL signée refuse. Aucun bucket n'est rendu : le
 *  seul bucket légitime est `PRIVATE_BUCKET`, il n'a pas à transiter par la donnée.
 *
 *  Volontairement `{ path: string } | null` plutôt qu'une simple chaîne : une chaîne vide
 *  est une valeur `string` comme une autre pour le compilateur, rien n'obligeait un
 *  appelant à la distinguer d'un chemin réel avant de la passer à `createSignedUrl` ou
 *  `remove`. `null` force le narrowing à chaque site d'appel — l'oubli devient une erreur
 *  de compilation, pas un bug en production. */
export type LinkedDocument =
  | { ok: false; response: NextResponse }
  | { ok: true; file: { path: string } | null };

/**
 * Résout le document RATTACHÉ à la tâche, en deux lectures service_role (RLS interdit
 * toute lecture directe des tables CRM par le client appelant).
 *
 * Trois invariants, chacun payé cher s'il saute :
 *  1. Le lien est vérifié sur LA PAIRE (task_id, document_id) — jamais sur le seul
 *     document : un documentId valide mais rattaché à une AUTRE tâche que celle gatée
 *     ne doit ni produire d'URL signée ni être supprimable.
 *  2. Une ERREUR de lecture n'est pas une absence. La confondre avec un « pas trouvé »
 *     ferait croire à l'appelant que l'objet n'existe pas, et — côté suppression —
 *     conduirait à effacer la métadonnée en sautant le retrait du fichier : le fichier
 *     resterait dans le bucket sans plus aucune ligne pour le référencer (orphelin muet,
 *     jamais purgé). On remonte donc un 500 explicite et on ne supprime rien.
 *  3. Le bucket est ÉPINGLÉ à PRIVATE_BUCKET, jamais lu depuis la ligne : sans cela une
 *     ligne ref_document pointant ailleurs ferait signer (ou supprimer) dans un bucket
 *     tiers avec le service_role. Le 409 unexpected_bucket ne doit sanctionner QUE ce
 *     cas-là — un chemin vide sur le bon bucket reste une ligne « déjà purgée », pas un
 *     bucket suspect ; les confondre rendrait indéboulonnable toute ligne portant le bon
 *     bucket et un chemin vide (régression sabotée et corrigée dans cette passe).
 */
export async function resolveLinkedDocument(
  server: ServerClient,
  taskId: string,
  documentId: string,
): Promise<LinkedDocument> {
  const { data: link, error: linkError } = await server
    .from('crm_task_document')
    .select('document_id')
    .eq('task_id', taskId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (linkError) {
    return { ok: false, response: NextResponse.json({ error: 'link_lookup_failed', detail: linkError.message }, { status: 500 }) };
  }
  if (!link) return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) };

  const { data: document, error: documentError } = await server
    .from('ref_document')
    .select('storage_bucket, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  if (documentError) {
    return { ok: false, response: NextResponse.json({ error: 'document_lookup_failed', detail: documentError.message }, { status: 500 }) };
  }

  const bucket = String((document as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const path = String((document as { storage_path?: string } | null)?.storage_path ?? '');
  // Chemin vide ⇒ rien à signer ni à supprimer, quel que soit le bucket déclaré : ligne
  // « déjà purgée » (purge manuelle, incident d'upload, ou tout simplement la ligne
  // ref_document elle-même introuvable — les deux cas convergent ici, aucun appelant
  // n'a besoin de les distinguer, tous deux se traduisent par « pas de fichier »).
  // Le tester AVANT le bucket est délibéré : un bucket correct (PRIVATE_BUCKET) avec un
  // chemin vide n'est PAS un bucket suspect, c'est une ligne sans fichier. Inverser
  // l'ordre — comme le faisait la version précédente — rend la ligne indéboulonnable
  // (409 permanent) alors qu'elle est parfaitement supprimable.
  if (!path) return { ok: true, file: null };
  // Chemin présent mais bucket différent de PRIVATE_BUCKET : seul cas légitime du 409,
  // le bucket est réellement inattendu.
  if (bucket !== PRIVATE_BUCKET) {
    return { ok: false, response: NextResponse.json({ error: 'unexpected_bucket' }, { status: 409 }) };
  }
  return { ok: true, file: { path } };
}
