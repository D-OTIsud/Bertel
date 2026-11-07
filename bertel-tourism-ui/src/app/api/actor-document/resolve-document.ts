import { NextResponse } from 'next/server';
import { PRIVATE_BUCKET, type ServerClient } from '../_document-auth';

type ActorDocumentLink = { status?: string; promoted_to_object_id?: string; promoted_document_id?: string };
type ActorDocumentMetadata = { storage_bucket?: string; storage_path?: string; access_scope?: string; extra?: unknown };
export type ResolvedActorDocument =
  | { ok: false; response: NextResponse }
  | { ok: true; link: ActorDocumentLink; document: ActorDocumentMetadata; bucket: string; path: string };

/** Exact pair and successful metadata reads precede each signer/destructive effect. */
export async function resolveActorDocument(server: ServerClient, actorId: string, documentId: string, deleting = false): Promise<ResolvedActorDocument> {
  const linked = await server.from('actor_document')
    .select('status, promoted_to_object_id, promoted_document_id')
    .eq('actor_id', actorId).eq('document_id', documentId).maybeSingle();
  if (linked.error) return { ok: false, response: NextResponse.json({ error: 'link_lookup_failed' }, { status: 500 }) };
  if (!linked.data) return { ok: false, response: NextResponse.json({ error: 'not_found' }, { status: 404 }) };
  const link = linked.data as ActorDocumentLink;
  if (deleting && link.status === 'promoted') {
    return { ok: false, response: NextResponse.json({ error: 'promoted_document', detail: 'Un document transféré reste dans l’historique.' }, { status: 409 }) };
  }
  const metadata = await server.from('ref_document').select('storage_bucket, storage_path, access_scope, extra')
    .eq('id', documentId).maybeSingle();
  if (metadata.error) return { ok: false, response: NextResponse.json({ error: 'document_lookup_failed' }, { status: 500 }) };
  if (!metadata.data) return { ok: false, response: NextResponse.json({ error: 'file_missing' }, { status: 404 }) };
  const document = metadata.data as ActorDocumentMetadata;
  const bucket = typeof document.storage_bucket === 'string' ? document.storage_bucket : '';
  const path = typeof document.storage_path === 'string' ? document.storage_path : '';
  // Even an empty path cannot authorize deletion of a foreign reference.
  if (deleting && bucket !== PRIVATE_BUCKET) return { ok: false, response: NextResponse.json({ error: 'unexpected_bucket' }, { status: 409 }) };
  return { ok: true, link, document, bucket, path };
}

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/;
export function legalDocumentObjectHint(resolved: Extract<ResolvedActorDocument, { ok: true }>, documentId: string): string | null {
  const extra = resolved.document.extra as { bertel_pj_import?: { mapped_object_id?: unknown } } | null;
  const mapped = extra?.bertel_pj_import?.mapped_object_id;
  if (mapped !== undefined && mapped !== null && mapped !== '') {
    return typeof mapped === 'string' && OBJECT_ID_SHAPE.test(mapped) ? mapped : null;
  }
  // This is only a hint for the existing RPC matcher, never a grant. Its fallback
  // also requires the exact legal/classification link inside PostgreSQL.
  const objectId = resolved.link.promoted_to_object_id;
  return resolved.bucket === 'legal-documents' && resolved.link.status === 'promoted'
    && resolved.link.promoted_document_id === documentId && typeof objectId === 'string' && OBJECT_ID_SHAPE.test(objectId)
    && (resolved.path.startsWith(`${objectId}/`) || resolved.path.startsWith(`objects/${objectId}/`)) ? objectId : null;
}
