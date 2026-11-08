import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { routeFailure } from '../_route-failure';
import { unlinkDocumentResponse } from '../_document-unlink';
import {
  readBoundedFormData,
  assertFormDataShape,
  FormDataShapeError,
  BodyTooLargeError,
  acquireLease,
  SEMAPHORE_RETRY_AFTER_SECONDS,
} from '@/lib/request-body.server';
import { MediaProcessingError } from '../media/upload/process-image';
import { processActorDocumentBuffer } from '../actor-document/process-actor-document';
import {
  PRIVATE_BUCKET,
  UUID_SHAPE,
  MAX_UPLOAD_BODY_BYTES,
  authenticated,
  callerClient,
  rejectOversizedBody,
  type AuthenticatedRequest,
} from '../_document-auth';
import { authorizeTask } from './authorize';

// Pièces jointes de TÂCHE CRM (17i) — clone du modèle actor-document : Bearer → getUser,
// autorisation par RPC DEFINER « en tant qu'appelant » (jamais la service key), fichier
// dans le bucket privé actor-documents sous tasks/{taskId}/, ref_document crm_private,
// lien crm_task_document, rollback en cascade sur échec partiel. Le gate est le prédicat
// d'ÉCRITURE (user_can_write_crm_task) pour les trois verbes : toutes les surfaces
// documents vivent derrière le modal d'édition, lui-même gated écriture. Le socle
// d'autorisation (gate + résolution du document lié) vit dans ./authorize, partagé avec
// url/route.ts : une seule copie du gate, un seul endroit à corriger.

export const runtime = 'nodejs';

async function processFile(file: File) {
  return processActorDocumentBuffer(Buffer.from(await file.arrayBuffer()), file.type);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  // Le gate ne peut pas précéder la lecture du corps (l'identifiant de la cible y est) :
  // à défaut, on refuse AVANT de bufferiser ce qui n'aurait jamais pu aboutir.
  const oversized = rejectOversizedBody(req);
  if (oversized) return oversized;
  const lease = acquireLease('upload');
  if (!lease) {
    return NextResponse.json(
      { error: 'too_many_requests', detail: 'Trop de téléversements en cours, réessayez.' },
      { status: 429, headers: { 'Retry-After': String(SEMAPHORE_RETRY_AFTER_SECONDS) } },
    );
  }
  try {
    return await handlePostAuthenticated(req, auth);
  } finally {
    lease.release();
  }
}

async function handlePostAuthenticated(
  req: NextRequest,
  auth: Extract<AuthenticatedRequest, { ok: true }>,
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await readBoundedFormData(req, MAX_UPLOAD_BODY_BYTES);
  } catch (error) {
    if (error instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: 'request_body_too_large', detail: 'Le fichier envoyé dépasse la taille maximale autorisée.' },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
  }
  try {
    assertFormDataShape(form, { allowedFields: ['task_id', 'file'] });
  } catch (error) {
    if (error instanceof FormDataShapeError) return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
    throw error;
  }
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
    if (uploadError) return routeFailure('task-document.POST', 'upload_failed');

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
      return routeFailure('task-document.POST', 'document_create_failed');
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
      return routeFailure('task-document.POST', 'task_document_create_failed');
    }
    return NextResponse.json({ documentId, title }, { status: 201 });
  } catch (error) {
    if (error instanceof MediaProcessingError) {
      const status = error.code === 'size' ? 413 : error.code === 'mime' ? 415 : 400;
      return NextResponse.json({ error: error.code, detail: error.message }, { status });
    }
    return routeFailure('task-document.POST', 'upload_failed');
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
  const { data, error } = await callerClient(auth.jwt).schema('api').rpc(
    'unlink_crm_task_document', { p_task_id: taskId, p_document_id: documentId },
  );
  return unlinkDocumentResponse('task-document.DELETE', data, error);
}
