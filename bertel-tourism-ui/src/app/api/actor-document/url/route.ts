import { NextResponse, type NextRequest } from 'next/server';
import { routeFailure } from '../../_route-failure';
import { UUID_SHAPE, PRIVATE_BUCKET, authenticated, callerClient } from '../../_document-auth';
import { authorizeActor } from '../authorize';
import { legalDocumentObjectHint, resolveActorDocument } from '../resolve-document';
import { isExactDocumentPath, signExactDocumentUrl } from '@/lib/document-signing.server';

const LEGAL_BUCKETS = new Set(['old_legal_media', 'legal-documents']);
const NO_STORE = { 'Cache-Control': 'private, no-store' };

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: { actorId?: unknown; documentId?: unknown } | null;
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const actorId = typeof body?.actorId === 'string' ? body.actorId : '';
  const documentId = typeof body?.documentId === 'string' ? body.documentId : '';
  if (!UUID_SHAPE.test(actorId) || !UUID_SHAPE.test(documentId)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });
  if (!await authorizeActor(auth.jwt, actorId, false)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const resolved = await resolveActorDocument(auth.server, actorId, documentId);
  if (!resolved.ok) return resolved.response;
  let file = { bucket: resolved.bucket, path: resolved.path };
  if (file.bucket === PRIVATE_BUCKET || (file.bucket === 'documents' && resolved.document.access_scope === 'public')) {
    if (!file.path) return NextResponse.json({ error: 'file_missing' }, { status: 404, headers: NO_STORE });
  } else if (LEGAL_BUCKETS.has(file.bucket) && resolved.document.access_scope === 'legal_private') {
    const objectId = legalDocumentObjectHint(resolved, documentId);
    if (!objectId) return NextResponse.json({ error: 'unexpected_bucket' }, { status: 409, headers: NO_STORE });
    const caller = callerClient(auth.jwt).schema('api');
    // Distinct existing authorities, same mapped pair; no CRM or raw-location fallback.
    const results = await Promise.all(['get_object_document_file', 'get_legal_object_document_file'].map((rpc) => caller.rpc(rpc, {
      p_object_id: objectId, p_document_id: documentId,
    })));
    if (results.some((result) => result.error)) {
      return routeFailure('actor-document.url.POST', 'authorization_check_failed', { status: 503, headers: NO_STORE });
    }
    const authorized = results.map((result) => result.data).filter((data) => data && typeof data === 'object' && data.authorized === true);
    if (!authorized.length) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
    const files = authorized.map((data) => data.file).filter((value) => value && typeof value === 'object');
    if (!files.length) return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
    file = files[0];
    if (files.some((value) => value.bucket !== file.bucket || value.path !== file.path) || !LEGAL_BUCKETS.has(file.bucket)) {
      return NextResponse.json({ error: 'file_missing' }, { status: 409, headers: NO_STORE });
    }
  } else {
    if (!file.bucket && !file.path) return NextResponse.json({ error: 'file_missing' }, { status: 404, headers: NO_STORE });
    return NextResponse.json({ error: 'unexpected_bucket' }, { status: 409, headers: NO_STORE });
  }
  if (typeof file.bucket !== 'string' || !isExactDocumentPath(file.path)) return NextResponse.json({ error: 'file_missing' }, { status: 409, headers: NO_STORE });
  const url = await signExactDocumentUrl(auth.server, file);
  if (!url) return routeFailure('actor-document.url.POST', 'signed_url_failed', { status: 503, headers: NO_STORE });
  return NextResponse.json({ url }, { headers: NO_STORE });
}
