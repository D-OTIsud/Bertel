import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  authenticated,
  callerClient,
  PRIVATE_BUCKET,
  UUID_SHAPE,
  rejectOversizedBody,
} from "../../_document-auth";
import {
  processImage,
  MediaProcessingError,
  MAX_INPUT_BYTES,
} from "../../media/upload/process-image";
import {
  readBoundedFormData,
  assertFormDataShape,
  acquireLease,
  BodyTooLargeError,
} from "@/lib/request-body.server";
export const runtime = "nodejs";
const fail = (error: string, status: number) =>
  NextResponse.json({ error }, { status });

export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  const oversized = rejectOversizedBody(req);
  if (oversized) return oversized;
  const lease = acquireLease("upload");
  if (!lease) return fail("too_many_requests", 429);
  try {
    let form: FormData;
    try {
      form = await readBoundedFormData(req, MAX_INPUT_BYTES + 1024 * 1024);
      assertFormDataShape(form, {
        allowedFields: ["object_id", "file", "rights"],
      });
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
      !/^[A-Z]{3}[A-Z0-9]{13}$/.test(objectId) ||
      !(file instanceof File) ||
      form.get("rights") !== "true"
    )
      return fail("invalid_fields", 400);
    const gate = await callerClient(auth.jwt)
      .schema("api")
      .rpc("portal_photo_upload_context", { p_object_id: objectId });
    const actorId =
      gate.data && typeof gate.data === "object"
        ? (gate.data as Record<string, unknown>).actorId
        : null;
    if (gate.error || typeof actorId !== "string" || !UUID_SHAPE.test(actorId))
      return fail("forbidden", 403);
    if (file.size > MAX_INPUT_BYTES) return fail("size", 413);
    const processed = await processImage({
      buffer: Buffer.from(await file.arrayBuffer()),
      mimeType: file.type,
    });
    const id = randomUUID(),
      path = `portal-photos/${actorId}/${id}.jpg`,
      title = file.name.trim().slice(0, 180) || "Photo";
    const bucket = auth.server.storage.from(PRIVATE_BUCKET);
    const uploaded = await bucket.upload(path, processed.buffer, {
      contentType: "image/jpeg",
      cacheControl: "0",
      upsert: false,
    });
    if (uploaded.error) return fail("upload_failed", 500);
    const doc = await auth.server
      .from("ref_document")
      .insert({
        id,
        title,
        url: `storage://${PRIVATE_BUCKET}/${path}`,
        storage_bucket: PRIVATE_BUCKET,
        storage_path: path,
        access_scope: "crm_private",
        extra: {
          source: "portal_photo",
          object_id: objectId,
          rights_confirmed: true,
          rights_confirmed_at: new Date().toISOString(),
          width: processed.width,
          height: processed.height,
        },
      })
      .select("id")
      .single();
    if (doc.error || !doc.data?.id) {
      await bucket.remove([path]);
      return fail("upload_failed", 500);
    }
    const link = await auth.server
      .from("actor_document")
      .insert({
        actor_id: actorId,
        document_id: id,
        title,
        created_by: auth.userId,
      });
    if (link.error) {
      await auth.server.from("ref_document").delete().eq("id", id);
      await bucket.remove([path]);
      return fail("upload_failed", 500);
    }
    return NextResponse.json(
      { id, title, width: processed.width, height: processed.height },
      { status: 201, headers: { "Cache-Control": "private, no-store" } },
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
