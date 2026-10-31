import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  authenticated,
  callerClient,
  PRIVATE_BUCKET,
  UUID_SHAPE,
} from "../../_document-auth";
import {
  processActorDocumentBuffer,
  ACTOR_PDF_MAX_BYTES,
} from "../../actor-document/process-actor-document";
import { MediaProcessingError } from "../../media/upload/process-image";
import {
  readBoundedFormData,
  assertFormDataShape,
  acquireLease,
  BodyTooLargeError,
} from "@/lib/request-body.server";

export const runtime = "nodejs";
const noStore = { "Cache-Control": "private, no-store" };
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status, headers: noStore });
const OBJECT_ID = /^[A-Z]{3}[A-Z0-9]{13}$/;

export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const lease = acquireLease("upload");
  if (!lease) return fail("too_many_requests", 429);
  try {
    let form: FormData;
    try {
      form = await readBoundedFormData(req, ACTOR_PDF_MAX_BYTES + 1024 * 1024);
      assertFormDataShape(form, { allowedFields: ["object_id", "file"] });
    } catch (error) {
      return fail(
        error instanceof BodyTooLargeError ? "size" : "invalid_fields",
        error instanceof BodyTooLargeError ? 413 : 400,
      );
    }
    const objectId = form.get("object_id"),
      file = form.get("file");
    if (
      typeof objectId !== "string" ||
      !OBJECT_ID.test(objectId) ||
      !(file instanceof File)
    )
      return fail("invalid_fields", 400);
    // Caller JWT, never service_role, decides persona, ownership and test realm.
    const gate = await callerClient(auth.jwt)
      .schema("api")
      .rpc("portal_message_upload_context", { p_object_id: objectId });
    const actorId =
      gate.data && typeof gate.data === "object"
        ? (gate.data as Record<string, unknown>).actorId
        : null;
    if (gate.error || typeof actorId !== "string" || !UUID_SHAPE.test(actorId))
      return fail("forbidden", 403);
    if (file.size > ACTOR_PDF_MAX_BYTES) return fail("size", 413);
    const processed = await processActorDocumentBuffer(
      Buffer.from(await file.arrayBuffer()),
      file.type,
    );
    const path = `portal-messages/${actorId}/${randomUUID()}.${processed.extension}`;
    const bucket = auth.server.storage.from(PRIVATE_BUCKET);
    const uploaded = await bucket.upload(path, processed.buffer, {
      contentType: processed.mimeType,
      cacheControl: "0",
      upsert: false,
    });
    if (uploaded.error) return fail("upload_failed", 500);
    const title = file.name.trim().slice(0, 180) || "Pièce jointe";
    const doc = await auth.server
      .from("ref_document")
      .insert({
        title,
        url: `storage://${PRIVATE_BUCKET}/${path}`,
        storage_bucket: PRIVATE_BUCKET,
        storage_path: path,
        access_scope: "crm_private",
        extra: {
          source: "portal_message",
          object_id: objectId,
          mime_type: processed.mimeType,
          size_bytes: processed.buffer.byteLength,
        },
      })
      .select("id")
      .single();
    if (doc.error || !doc.data?.id) {
      await bucket.remove([path]);
      return fail("upload_failed", 500);
    }
    const linked = await auth.server
      .from("actor_document")
      .insert({
        actor_id: actorId,
        document_id: doc.data.id,
        title,
        created_by: auth.userId,
      });
    if (linked.error) {
      await auth.server.from("ref_document").delete().eq("id", doc.data.id);
      await bucket.remove([path]);
      return fail("upload_failed", 500);
    }
    return NextResponse.json(
      { id: doc.data.id, title },
      { status: 201, headers: noStore },
    );
  } catch (error) {
    return fail(
      error instanceof MediaProcessingError ? error.code : "upload_failed",
      error instanceof MediaProcessingError
        ? error.code === "size"
          ? 413
          : 415
        : 500,
    );
  } finally {
    lease.release();
  }
}

/** Sign only a registered private document, after the caller-scoped SQL gate. */
export async function PUT(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
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
