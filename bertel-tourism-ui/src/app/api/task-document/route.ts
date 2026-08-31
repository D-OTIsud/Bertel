import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { MediaProcessingError } from '../media/upload/process-image';
import { processActorDocumentBuffer } from '../actor-document/process-actor-document';

// Pièces jointes de TÂCHE CRM (17i) — clone du modèle actor-document : Bearer → getUser,
// autorisation par RPC DEFINER « en tant qu'appelant » (jamais la service key), fichier
// dans le bucket privé actor-documents sous tasks/{taskId}/, ref_document crm_private,
// lien crm_task_document, rollback en cascade sur échec partiel. Le gate est le prédicat
// d'ÉCRITURE (user_can_write_crm_task) pour les trois verbes : toutes les surfaces
// documents vivent derrière le modal d'édition, lui-même gated écriture.
const PRIVATE_BUCKET = 'actor-documents';
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';

function bearer(req: NextRequest): string {
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
async function authorizeTask(jwt: string, taskId: string): Promise<boolean> {
  const { data, error } = await callerClient(jwt).schema('api').rpc(
    'user_can_write_crm_task', { p_task_id: taskId });
  return !error && data === true;
}

type AuthenticatedRequest =
  | { ok: false; response: NextResponse }
  | {
      ok: true;
      server: NonNullable<ReturnType<typeof getServerSupabaseClient>>;
      jwt: string;
      userId: string;
    };

async function authenticated(req: NextRequest): Promise<AuthenticatedRequest> {
  const server = getServerSupabaseClient();
  if (!server) return { ok: false, response: NextResponse.json({ error: 'server_misconfigured' }, { status: 500 }) };
  const jwt = bearer(req);
  if (!jwt) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  const { data, error } = await server.auth.getUser(jwt);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
  return { ok: true, server, jwt, userId: data.user.id };
}

async function processFile(file: File) {
  return processActorDocumentBuffer(Buffer.from(await file.arrayBuffer()), file.type);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: 'bad_multipart' }, { status: 400 }); }
  const taskId = form.get('task_id');
  const file = form.get('file');
  if (typeof taskId !== 'string' || !UUID_SHAPE.test(taskId) || !(file instanceof File)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeTask(auth.jwt, taskId)) {
    return NextResponse.json({ error: 'forbidden', detail: 'caller cannot edit this task' }, { status: 403 });
  }

  try {
    const processed = await processFile(file);
    const path = `tasks/${taskId}/${randomUUID()}.${processed.extension}`;
    const { error: uploadError } = await auth.server.storage.from(PRIVATE_BUCKET).upload(path, processed.buffer, {
      contentType: processed.mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const title = file.name.trim() || 'Document de tâche';
    const storageUrl = `storage://${PRIVATE_BUCKET}/${path}`;
    const { data: document, error: documentError } = await auth.server
      .from('ref_document')
      .insert({
        url: storageUrl,
        title,
        storage_bucket: PRIVATE_BUCKET,
        storage_path: path,
        access_scope: 'crm_private',
        extra: { mime_type: processed.mimeType, size_bytes: processed.buffer.byteLength },
      })
      .select('id')
      .single();
    if (documentError || !document) {
      // Le fichier est déjà dans le bucket : sans ce retrait, il devient orphelin (plus
      // aucune ligne ref_document ne le référence, plus aucune purge automatique).
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'document_create_failed', detail: documentError?.message }, { status: 500 });
    }

    const documentId = String((document as { id: string }).id);
    const { error: linkError } = await auth.server.from('crm_task_document').insert({
      task_id: taskId,
      document_id: documentId,
      title,
      created_by: auth.userId,
    });
    if (linkError) {
      // Le lien est le seul rattachement entre le document et la tâche : sans lui,
      // ref_document + le fichier storage sont deux orphelins muets. On retire les deux.
      await auth.server.from('ref_document').delete().eq('id', documentId);
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'task_document_create_failed', detail: linkError.message }, { status: 500 });
    }
    return NextResponse.json({ documentId, title }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaProcessingError) {
      const status = error.code === 'size' ? 413 : error.code === 'mime' ? 415 : 400;
      return NextResponse.json({ error: error.code, detail: error.message }, { status });
    }
    return NextResponse.json({ error: 'upload_failed', detail: error instanceof Error ? error.message : 'unknown' }, { status: 500 });
  }
}

async function readJson(req: NextRequest): Promise<Record<string, unknown> | null> {
  try {
    const value = await req.json();
    return value && typeof value === 'object' ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  const taskId = typeof body?.taskId === 'string' ? body.taskId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!UUID_SHAPE.test(taskId) || !UUID_SHAPE.test(documentId)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeTask(auth.jwt, taskId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Le lien est vérifié sur LA PAIRE (task_id, document_id), pas seulement le document :
  // un documentId valide mais rattaché à une autre tâche ne doit jamais passer ce garde.
  const { data: link } = await auth.server
    .from('crm_task_document')
    .select('document_id')
    .eq('task_id', taskId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  const { data: document } = await auth.server
    .from('ref_document')
    .select('storage_bucket, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  const bucket = String((document as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const path = String((document as { storage_path?: string } | null)?.storage_path ?? '');
  // Le fichier storage peut déjà avoir disparu (purge manuelle, incident) : on ne bloque
  // pas la suppression de la ligne pour autant, remove() est silencieusement idempotent.
  if (bucket && path) await auth.server.storage.from(bucket).remove([path]);
  const { error } = await auth.server.from('ref_document').delete().eq('id', documentId);
  if (error) return NextResponse.json({ error: 'delete_failed', detail: error.message }, { status: 500 });
  // crm_task_document.document_id référence ref_document en CASCADE FK : la ligne de lien
  // tombe automatiquement, jamais supprimée à la main (source unique de vérité = la FK).
  return NextResponse.json({ deleted: true });
}
