import { randomUUID } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { engineErrorDetail } from '@/lib/db-error-message';
import { MediaProcessingError, MAX_INPUT_BYTES } from '../media/upload/process-image';
import { processActorDocumentBuffer, ACTOR_PDF_MAX_BYTES } from './process-actor-document';
import {
  readBoundedFormData,
  assertFormDataShape,
  FormDataShapeError,
  BodyTooLargeError,
  acquireLease,
  SEMAPHORE_RETRY_AFTER_SECONDS,
} from '@/lib/request-body.server';
import {
  PRIVATE_BUCKET,
  UUID_SHAPE,
  authenticated,
  rejectOversizedBody,
  type AuthenticatedRequest,
} from '../_document-auth';
import { authorizeActor, authorizeObject } from './authorize';

// Documents privés d'un ACTEUR CRM. Le socle d'authentification (Bearer → getUser, client
// « en tant qu'appelant », bucket privé, forme UUID) est partagé avec /api/task-document
// dans ../_document-auth ; les deux prédicats d'autorisation vivent dans ./authorize,
// partagés avec url/route.ts. Ici ne restent que le traitement de fichier, les rollbacks et
// les formes de réponse métier.

/** Bucket PUBLIC de destination de la promotion (PATCH) — l'espace média d'un objet. */
const PUBLIC_BUCKET = 'documents';
/** Identifiant canonique d'objet : 3 lettres de type + 3 + 10. Ce n'est pas un UUID. */
const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/;
// Raw multipart envelope for POST: largest accepted single file (image, 20 MiB) + 1 MiB overhead.
// PDFs are capped lower (5 MiB, see process-actor-document.ts) but share this ceiling.
const MAX_MULTIPART_BYTES = MAX_INPUT_BYTES + 1024 * 1024;

export const runtime = 'nodejs';

async function processFile(file: File) {
  return processActorDocumentBuffer(Buffer.from(await file.arrayBuffer()), file.type);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  // Preserve the shared early 413 response; the bounded reader below also checks the actual
  // stream when Content-Length is absent or false, before parsing or processing any file.
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
    form = await readBoundedFormData(req, MAX_MULTIPART_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: 'request_body_too_large', detail: 'Le fichier envoyé dépasse la taille maximale autorisée.' },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
  }
  try {
    assertFormDataShape(form, { allowedFields: ['actor_id', 'file'] });
  } catch (err) {
    if (err instanceof FormDataShapeError) return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
    throw err;
  }
  const actorId = form.get('actor_id');
  const file = form.get('file');
  if (typeof actorId !== 'string' || !UUID_SHAPE.test(actorId) || !(file instanceof File)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeActor(auth.jwt, actorId)) {
    return NextResponse.json({ error: 'forbidden', detail: 'caller cannot edit this actor' }, { status: 403 });
  }

  try {
    // Declared-size preflight BEFORE arrayBuffer(): the envelope alone (sized for the larger
    // of the two accepted kinds, a 20 MiB image) would otherwise let an oversized declared PDF
    // be fully buffered before processActorDocumentBuffer's own 5 MiB check rejects it.
    const isPdf = file.type === 'application/pdf';
    const maxDeclaredBytes = isPdf ? ACTOR_PDF_MAX_BYTES : MAX_INPUT_BYTES;
    if (file.size > maxDeclaredBytes) {
      throw new MediaProcessingError(
        'size',
        isPdf
          ? `Le PDF dépasse la limite de ${ACTOR_PDF_MAX_BYTES} octets (5 Mo).`
          : `Image trop volumineuse (max ${Math.round(MAX_INPUT_BYTES / (1024 * 1024))} Mo).`,
      );
    }
    const processed = await processFile(file);
    const path = `actors/${actorId}/${randomUUID()}.${processed.extension}`;
    const { error: uploadError } = await auth.server.storage.from(PRIVATE_BUCKET).upload(path, processed.buffer, {
      contentType: processed.mimeType,
      cacheControl: '3600',
      upsert: false,
    });
    if (uploadError) return NextResponse.json({ error: 'upload_failed', detail: uploadError.message }, { status: 500 });

    const title = file.name.trim() || 'Document acteur';
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
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'document_create_failed', detail: documentError?.message }, { status: 500 });
    }

    const documentId = String((document as { id: string }).id);
    const { error: linkError } = await auth.server.from('actor_document').insert({
      actor_id: actorId,
      document_id: documentId,
      title,
      created_by: auth.userId,
    });
    if (linkError) {
      await auth.server.from('ref_document').delete().eq('id', documentId);
      await auth.server.storage.from(PRIVATE_BUCKET).remove([path]);
      return NextResponse.json({ error: 'actor_document_create_failed', detail: linkError.message }, { status: 500 });
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
  const actorId = typeof body?.actorId === 'string' ? body.actorId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!UUID_SHAPE.test(actorId) || !UUID_SHAPE.test(documentId)) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  if (!await authorizeActor(auth.jwt, actorId)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: link } = await auth.server
    .from('actor_document')
    .select('status')
    .eq('actor_id', actorId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if ((link as { status?: string }).status === 'promoted') {
    return NextResponse.json({ error: 'promoted_document', detail: 'Un document transféré reste dans l’historique.' }, { status: 409 });
  }
  const { data: document } = await auth.server
    .from('ref_document')
    .select('storage_bucket, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  const bucket = String((document as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const path = String((document as { storage_path?: string } | null)?.storage_path ?? '');
  if (bucket && path) await auth.server.storage.from(bucket).remove([path]);
  const { error } = await auth.server.from('ref_document').delete().eq('id', documentId);
  if (error) {
    // `delete_failed` est dans `CODES_WITH_BUSINESS_DETAIL` (api-error.ts) : son `detail` est
    // affiché VERBATIM. Ici il ne vient d'aucun `RAISE` métier — c'est la sortie brute du moteur.
    // Sans ce filtre, l'utilisateur qui retire une pièce jointe lisait « update or delete on table
    // "ref_document" violates foreign key constraint … ». `engineErrorDetail` rend une phrase FR
    // pour les SQLSTATE actionnables et `undefined` sinon, auquel cas le client retombe sur
    // « La suppression a échoué. » — générique, mais jamais l'anglais du moteur.
    return NextResponse.json(
      { error: 'delete_failed', detail: engineErrorDetail(error, { operation: 'delete' }) },
      { status: 500 },
    );
  }
  return NextResponse.json({ deleted: true });
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  const actorId = typeof body?.actorId === 'string' ? body.actorId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  const objectId = typeof body?.objectId === 'string' ? body.objectId : '';
  const roleCode = typeof body?.roleCode === 'string' ? body.roleCode.trim() : '';
  const requestedTitle = typeof body?.title === 'string' ? body.title.trim() : '';
  if (!UUID_SHAPE.test(actorId) || !UUID_SHAPE.test(documentId) || !OBJECT_ID_SHAPE.test(objectId) || !roleCode) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  }
  const [canActor, canObject] = await Promise.all([
    authorizeActor(auth.jwt, actorId),
    authorizeObject(auth.jwt, objectId),
  ]);
  if (!canActor || !canObject) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: link } = await auth.server
    .from('actor_document')
    .select('status, title, valid_from, valid_to')
    .eq('actor_id', actorId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if ((link as { status?: string }).status === 'promoted') return NextResponse.json({ error: 'already_promoted' }, { status: 409 });

  const { data: source } = await auth.server
    .from('ref_document')
    .select('title, storage_bucket, storage_path, extra')
    .eq('id', documentId)
    .maybeSingle();
  const sourceBucket = String((source as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const sourcePath = String((source as { storage_path?: string } | null)?.storage_path ?? '');
  if (sourceBucket !== PRIVATE_BUCKET || !sourcePath) {
    return NextResponse.json({ error: 'source_missing' }, { status: 409 });
  }
  const { data: blob, error: downloadError } = await auth.server.storage.from(sourceBucket).download(sourcePath);
  if (downloadError || !blob) return NextResponse.json({ error: 'download_failed', detail: downloadError?.message }, { status: 500 });

  const extension = sourcePath.toLowerCase().endsWith('.pdf') ? 'pdf' : 'jpg';
  const mimeType = extension === 'pdf' ? 'application/pdf' : 'image/jpeg';
  const targetPath = `${objectId}/${randomUUID()}.${extension}`;
  const targetBuffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await auth.server.storage.from(PUBLIC_BUCKET).upload(targetPath, targetBuffer, {
    contentType: mimeType,
    cacheControl: '31536000',
    upsert: false,
  });
  if (uploadError) return NextResponse.json({ error: 'promotion_upload_failed', detail: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = auth.server.storage.from(PUBLIC_BUCKET).getPublicUrl(targetPath);
  const title = requestedTitle || String((link as { title?: string }).title ?? (source as { title?: string } | null)?.title ?? 'Document');
  const { data: targetDocument, error: targetError } = await auth.server
    .from('ref_document')
    .insert({
      url: publicUrlData.publicUrl,
      title,
      storage_bucket: PUBLIC_BUCKET,
      storage_path: targetPath,
      access_scope: 'public',
      extra: { mime_type: mimeType, size_bytes: targetBuffer.byteLength, promoted_from_actor_document: documentId },
    })
    .select('id')
    .single();
  if (targetError || !targetDocument) {
    await auth.server.storage.from(PUBLIC_BUCKET).remove([targetPath]);
    return NextResponse.json({ error: 'promotion_document_failed', detail: targetError?.message }, { status: 500 });
  }
  const targetDocumentId = String((targetDocument as { id: string }).id);
  const { data: role } = await auth.server
    // Les partitions ref_code_* ne sont pas exposées directement par PostgREST :
    // résoudre le rôle via la table parente et son domaine explicite.
    .from('ref_code')
    .select('id')
    .eq('domain', 'document_type')
    .eq('code', roleCode)
    .eq('is_active', true)
    .maybeSingle();
  if (!role) {
    await auth.server.from('ref_document').delete().eq('id', targetDocumentId);
    await auth.server.storage.from(PUBLIC_BUCKET).remove([targetPath]);
    return NextResponse.json({ error: 'unknown_document_type' }, { status: 400 });
  }
  const { error: objectLinkError } = await auth.server.from('object_document').insert({
    object_id: objectId,
    document_id: targetDocumentId,
    role_id: (role as { id: string }).id,
    title,
    valid_from: (link as { valid_from?: string | null }).valid_from ?? null,
    valid_to: (link as { valid_to?: string | null }).valid_to ?? null,
  });
  if (objectLinkError) {
    await auth.server.from('ref_document').delete().eq('id', targetDocumentId);
    await auth.server.storage.from(PUBLIC_BUCKET).remove([targetPath]);
    return NextResponse.json({ error: 'object_link_failed', detail: objectLinkError.message }, { status: 500 });
  }
  const { error: historyError } = await auth.server.from('actor_document').update({
    document_id: targetDocumentId,
    status: 'promoted',
    intended_role_id: (role as { id: string }).id,
    promoted_to_object_id: objectId,
    promoted_document_id: targetDocumentId,
    promoted_at: new Date().toISOString(),
  }).eq('actor_id', actorId).eq('document_id', documentId);
  if (historyError) {
    await auth.server.from('ref_document').delete().eq('id', targetDocumentId);
    await auth.server.storage.from(PUBLIC_BUCKET).remove([targetPath]);
    return NextResponse.json({ error: 'history_update_failed', detail: historyError.message }, { status: 500 });
  }

  // Migration réelle, sans duplication durable : la ligne d'historique pointe désormais vers
  // le document établissement ; le binaire privé et son ancienne métadonnée sont supprimés.
  await auth.server.storage.from(sourceBucket).remove([sourcePath]);
  await auth.server.from('ref_document').delete().eq('id', documentId);
  return NextResponse.json({ documentId: targetDocumentId });
}
