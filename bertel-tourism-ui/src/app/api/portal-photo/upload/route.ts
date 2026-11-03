import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { authenticated, callerClient, PRIVATE_BUCKET, UUID_SHAPE, rejectOversizedBody } from "../../_document-auth";
import { processImage, MediaProcessingError, MAX_INPUT_BYTES } from "../../media/upload/process-image";
import { readBoundedFormData, assertFormDataShape, acquireLease, BodyTooLargeError } from "@/lib/request-body.server";

export const runtime = "nodejs";
const fail = (error: string, status: number) => NextResponse.json({ error }, { status });
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const digest = (value: Buffer) => createHash("sha256").update(value).digest("hex");
function rpcFailure(error: { code?: string; details?: string } | null) {
  return error?.code === "PT409" ? fail(error.details === "photo_limit" ? "photo_limit" : "upload_conflict", 409)
    : error?.code === "PT429" ? fail("upload_daily_limit", 429)
    : error?.code === "42501" ? fail("forbidden", 403) : fail("upload_unconfirmed", 503);
}

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
      assertFormDataShape(form, { allowedFields: ["object_id", "file", "rights", "upload_id", "replace_media_id"] });
    } catch (error) {
      return fail(error instanceof BodyTooLargeError ? "size" : "invalid_fields", error instanceof BodyTooLargeError ? 413 : 400);
    }
    const objectId = form.get("object_id"), file = form.get("file"), uploadId = form.get("upload_id"), replacement = form.get("replace_media_id");
    if (typeof objectId !== "string" || !/^[A-Z]{3}[A-Z0-9]{13}$/.test(objectId) || !(file instanceof File)
      || form.get("rights") !== "true" || typeof uploadId !== "string" || !UUID_SHAPE.test(uploadId)
      || (replacement !== null && (typeof replacement !== "string" || !UUID_SHAPE.test(replacement)))) return fail("invalid_fields", 400);

    const caller = callerClient(auth.jwt).schema("api");
    const gate = await caller.rpc("portal_photo_upload_context", { p_object_id: objectId });
    const actorId = record(gate.data).actorId;
    if (gate.error || typeof actorId !== "string" || !UUID_SHAPE.test(actorId)) return fail("forbidden", 403);
    if (file.size > MAX_INPUT_BYTES) return fail("size", 413);
    const processed = await processImage({ buffer: Buffer.from(await file.arrayBuffer()), mimeType: file.type });
    const sha256 = digest(processed.buffer), title = file.name.trim().slice(0, 180) || "Photo";
    // Reserve under the object lock BEFORE Storage; the browser keeps this UUID for retries.
    const reservation = await caller.rpc("reserve_portal_photo_upload", { p_object_id: objectId, p_upload_id: uploadId, p_replace_media_id: replacement });
    if (reservation.error) return rpcFailure(reservation.error);
    const receipt = record(reservation.data), path = `portal-photos/${actorId}/${uploadId}.jpg`;
    if (receipt.id !== uploadId || receipt.actorId !== actorId || receipt.path !== path) return fail("upload_unconfirmed", 503);
    if (receipt.ready === true) {
      if (receipt.sha256 !== sha256) return fail("upload_conflict", 409);
      return NextResponse.json({ id: uploadId, title: receipt.title, width: receipt.width, height: receipt.height }, { status: 200, headers: { "Cache-Control": "private, no-store" } });
    }
    const bucket = auth.server.storage.from(PRIVATE_BUCKET);
    const uploaded = await bucket.upload(path, processed.buffer, { contentType: "image/jpeg", cacheControl: "0", upsert: false });
    if (uploaded.error) {
      // A previous upload may have succeeded with its response lost. Never overwrite it.
      const existing = await bucket.download(path);
      if (existing.error || !existing.data) return fail("upload_unconfirmed", 503);
      if (digest(Buffer.from(await existing.data.arrayBuffer())) !== sha256) return fail("upload_conflict", 409);
    }
    const completed = await auth.server.schema("api").rpc("complete_portal_photo_upload", {
      p_user_id: auth.userId, p_document_id: uploadId, p_sha256: sha256, p_title: title, p_width: processed.width, p_height: processed.height,
    });
    if (completed.error) return rpcFailure(completed.error);
    const data = record(completed.data);
    if (data.id !== uploadId) return fail("upload_unconfirmed", 503);
    // On an uncertain completion, retain the private bytes and reservation. A retry of the
    // same UUID/hash confirms the result; compensation must never delete a completed file.
    return NextResponse.json(data, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return fail(error instanceof MediaProcessingError ? error.code : "upload_unconfirmed", error instanceof MediaProcessingError ? error.code === "size" ? 413 : 415 : 503);
  } finally { lease.release(); }
}
