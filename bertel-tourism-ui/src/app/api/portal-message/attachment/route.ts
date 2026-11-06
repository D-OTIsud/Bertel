import { NextResponse, type NextRequest } from 'next/server';
import { authenticated, callerClient, PRIVATE_BUCKET, UUID_SHAPE } from '../../_document-auth';
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
export const runtime = 'nodejs';
const noStore = { 'Cache-Control': 'private, no-store' };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore });

/** Sign only a registered private document, after the caller-scoped SQL gate. */
export async function PUT(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readBoundedJson(req,2048);
  } catch(error) {
    if(error instanceof BodyTooLargeError)return fail('request_body_too_large',413);
    return fail("invalid_fields", 400);
  }
  const id =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).documentId
      : null;
  if (typeof id !== "string" || !UUID_SHAPE.test(id))
    return fail("invalid_fields", 400);
  const { data, error } = await callerClient(auth.jwt)
    .schema("api")
    .rpc("portal_message_document", { p_document_id: id });
  const doc =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (
    error ||
    doc?.bucket !== PRIVATE_BUCKET ||
    typeof doc.path !== "string" ||
    !doc.path.startsWith("portal-messages/")
  )
    return fail("forbidden", 403);
  const result = await auth.server.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(doc.path, 120, { download: true });
  if (result.error || !result.data?.signedUrl) return fail("unavailable", 500);
  return NextResponse.json(
    { url: result.data.signedUrl },
    { headers: noStore },
  );
}
