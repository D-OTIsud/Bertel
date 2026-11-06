import { NextResponse, type NextRequest } from 'next/server';
import { UUID_SHAPE, authenticated, callerClient } from '../../_document-auth';
import { BodyTooLargeError, readBoundedJson } from '@/lib/request-body.server';

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/;
const PRIVATE_BUCKETS = new Set(['old_legal_media', 'legal-documents']);
const SIGNED_URL_TTL_SECONDS = 60;
const NO_STORE = { 'Cache-Control': 'private, no-store' };
export const runtime = 'nodejs';

function exactSignedUrl(sdkUrl: string, bucket: string, path: string): string | null {
  // storage-js encodeURI leaves reserved key characters intact. Keep only the
  // trusted signer endpoint/token, and encode the authorized key once per segment.
  const marker = sdkUrl.indexOf('/object/sign/');
  const token = /[?&]token=([^&#]+)$/.exec(sdkUrl)?.[1];
  if (marker < 0 || !token) return null;
  try {
    const url = new URL(`${sdkUrl.slice(0, marker)}/object/sign/${encodeURIComponent(bucket)}/${path.split('/').map(encodeURIComponent).join('/')}`);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) return null;
    url.searchParams.set('token', decodeURIComponent(token));
    return url.toString();
  } catch { return null; }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try { body = await readBoundedJson(req, 2048); }
  catch (error) { return NextResponse.json({ error: error instanceof BodyTooLargeError ? 'request_body_too_large' : 'bad_json' }, { status: error instanceof BodyTooLargeError ? 413 : 400, headers: NO_STORE }); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400, headers: NO_STORE });
  const { objectId, documentId, accessContext } = body as Record<string, unknown>;
  if (typeof objectId !== 'string' || !OBJECT_ID_SHAPE.test(objectId) || typeof documentId !== 'string' || !UUID_SHAPE.test(documentId)
    || (accessContext !== undefined && accessContext !== 'canonical' && accessContext !== 'legal')) {
    return NextResponse.json({ error: 'invalid_fields' }, { status: 400, headers: NO_STORE });
  }

  // The caller-scoped RPC checks current rights and the exact mapped
  // pair before revealing any Storage location. The service key only signs.
  const rpc = accessContext === 'legal' ? 'get_legal_object_document_file' : 'get_object_document_file';
  const { data, error } = await callerClient(auth.jwt).schema('api').rpc(rpc, {
    p_object_id: objectId, p_document_id: documentId,
  });
  if (error) return NextResponse.json({ error: 'authorization_check_failed' }, { status: 503, headers: NO_STORE });
  if (!data || typeof data !== 'object' || data.authorized !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: NO_STORE });
  const file = data.file;
  if (!file || typeof file !== 'object') return NextResponse.json({ error: 'not_found' }, { status: 404, headers: NO_STORE });
  if (typeof file.bucket !== 'string' || !PRIVATE_BUCKETS.has(file.bucket) || typeof file.path !== 'string'
    || !file.path || file.path.startsWith('/') || file.path.includes('\\') || file.path.split('/').some((part: string) => part === '.' || part === '..')) {
    return NextResponse.json({ error: 'file_missing' }, { status: 409, headers: NO_STORE });
  }
  // The batch endpoint carries keys in JSON. createSignedUrl interpolates its
  // key in the request URL, where ?/# and encoded dot segments change the target.
  const signed = await auth.server.storage.from(file.bucket).createSignedUrls([file.path], SIGNED_URL_TTL_SECONDS);
  const item = signed.data?.length === 1 ? signed.data[0] : null;
  const url = !signed.error && item && !item.error && item.path === file.path && item.signedUrl
    ? exactSignedUrl(item.signedUrl, file.bucket, file.path) : null;
  if (!url) return NextResponse.json({ error: 'signed_url_failed' }, { status: 503, headers: NO_STORE });
  return NextResponse.json({ url }, { headers: NO_STORE });
}
