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

/** Résultat de `resolveLinkedDocument`. `storagePath` vide = la ligne existe mais ne
 *  désigne aucun fichier (purge manuelle, incident d'upload) : à chaque appelant de
 *  décider — la suppression tolère, l'URL signée refuse. Aucun bucket n'est rendu :
 *  le seul bucket légitime est `PRIVATE_BUCKET`, il n'a pas à transiter par la donnée. */
export type LinkedDocument =
  | { ok: false; response: NextResponse }
  | { ok: true; storagePath: string };

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
 *     tiers avec le service_role. Même refus 409 que actor-document en pareil cas.
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
  // Ligne sans coordonnées de fichier : cas « déjà purgé », distinct d'une erreur de
  // lecture ci-dessus. On rend un chemin vide, l'appelant tranche.
  if (!bucket && !path) return { ok: true, storagePath: '' };
  if (bucket !== PRIVATE_BUCKET || !path) {
    return { ok: false, response: NextResponse.json({ error: 'unexpected_bucket' }, { status: 409 }) };
  }
  return { ok: true, storagePath: path };
}
