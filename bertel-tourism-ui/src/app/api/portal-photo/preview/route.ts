import { NextResponse, type NextRequest } from "next/server";
import {
  authenticated,
  callerClient,
  PRIVATE_BUCKET,
  UUID_SHAPE,
} from "../../_document-auth";
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await readBoundedJson(req,2048);
  } catch(error) {
    if(error instanceof BodyTooLargeError)return NextResponse.json({error:'request_body_too_large'},{status:413});
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  }
  const id =
    body && typeof body === "object"
      ? (body as Record<string, unknown>).documentId
      : null;
  if (typeof id !== "string" || !UUID_SHAPE.test(id))
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  const { data, error } = await callerClient(auth.jwt)
    .schema("api")
    .rpc("portal_photo_preview", { p_document_id: id });
  const doc =
    data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  if (
    error ||
    doc?.bucket !== PRIVATE_BUCKET ||
    typeof doc.path !== "string" ||
    !doc.path.startsWith("portal-photos/")
  )
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const signed = await auth.server.storage
    .from(PRIVATE_BUCKET)
    .createSignedUrl(doc.path, 120);
  if (signed.error || !signed.data?.signedUrl)
    return NextResponse.json({ error: "unavailable" }, { status: 500 });
  return NextResponse.json(
    { url: signed.data.signedUrl },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
