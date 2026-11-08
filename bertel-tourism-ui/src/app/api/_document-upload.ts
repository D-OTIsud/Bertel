import { createHash, randomUUID } from 'node:crypto';

import { PRIVATE_BUCKET, callerClient, type AuthenticatedRequest } from './_document-auth';

type UploadAuth = Extract<AuthenticatedRequest, { ok: true }>;
type ParentKind = 'actor' | 'task';
type FailureStage = 'upload_failed' | 'document_create_failed' | 'actor_document_create_failed' | 'task_document_create_failed';
type UploadResult = { ok: true; documentId: string; title: string } | { ok: false; stage: FailureStage };
type ProcessedDocument = { buffer: Buffer; mimeType: string; extension: string };

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** An uncertain result retains the private intent and bytes. This flow never compensates
 *  with Storage remove, metadata delete, or a repeated provider upload. */
export async function uploadCrmDocument(
  auth: UploadAuth, parentKind: ParentKind, parentId: string, title: string, processed: ProcessedDocument,
): Promise<UploadResult> {
  const uploadId = randomUUID();
  const path = `${parentKind === 'actor' ? 'actors' : 'tasks'}/${parentId.toLowerCase()}/${uploadId}.${processed.extension}`;
  const sha256 = createHash('sha256').update(processed.buffer).digest('hex');
  const caller = callerClient(auth.jwt).schema('api');
  const prepared = await caller.rpc('prepare_crm_document_upload', {
    p_upload_id: uploadId, p_parent_kind: parentKind, p_parent_id: parentId, p_title: title,
    p_mime_type: processed.mimeType, p_extension: processed.extension,
    p_size_bytes: processed.buffer.byteLength, p_sha256: sha256,
  });
  if (prepared.error || !object(prepared.data) || prepared.data.uploadId !== uploadId
    || prepared.data.documentId !== uploadId || prepared.data.bucket !== PRIVATE_BUCKET
    || prepared.data.path !== path || prepared.data.state !== 'prepared') {
    return { ok: false, stage: 'document_create_failed' };
  }

  const uploaded = await auth.server.storage.from(PRIVATE_BUCKET).upload(path, processed.buffer, {
    contentType: processed.mimeType, cacheControl: '3600', upsert: false,
  });
  if (uploaded.error || !uploaded.data || uploaded.data.path !== path) {
    return { ok: false, stage: 'upload_failed' };
  }
  const confirmed = await auth.server.schema('api').rpc('confirm_crm_document_upload', {
    p_upload_id: uploadId, p_user_id: auth.userId, p_storage_path: path,
    p_sha256: sha256, p_size_bytes: processed.buffer.byteLength, p_mime_type: processed.mimeType,
  });
  if (confirmed.error || !object(confirmed.data) || confirmed.data.uploadId !== uploadId
    || confirmed.data.state !== 'uploaded') {
    return { ok: false, stage: 'document_create_failed' };
  }

  const attached = await caller.rpc('attach_crm_document_upload', { p_upload_id: uploadId });
  if (attached.error || !object(attached.data) || attached.data.documentId !== uploadId || attached.data.title !== title) {
    const documentInsertFailed = attached.error?.code === 'PT500' && attached.error.message === 'document_create_failed';
    return { ok: false, stage: documentInsertFailed ? 'document_create_failed' : `${parentKind}_document_create_failed` };
  }
  return { ok: true, documentId: uploadId, title };
}
