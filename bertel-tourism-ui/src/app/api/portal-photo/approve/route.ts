import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import {
  authenticated,
  callerClient,
  PRIVATE_BUCKET,
  UUID_SHAPE,
  type ServerClient,
} from "../../_document-auth";
import { MAX_INPUT_BYTES } from "../../media/upload/process-image";
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';
export const runtime = "nodejs";
type Rec = Record<string, unknown>;
const record = (value: unknown): Rec | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Rec)
    : null;

/** On uncertain SQL delivery, the database decides which public copies can be removed. */
async function compensate(server: ServerClient, claimId: string) {
  const result = await server
    .schema("api")
    .rpc("portal_photo_failed_approval", { p_claim_id: claimId });
  if (result.error || !Array.isArray(result.data)) return;
  const paths = result.data.filter(
    (path): path is string =>
      typeof path === "string" &&
      /^portal-approved\/[0-9a-f-]{36}\.jpg$/i.test(path),
  );
  if (paths.length) await server.storage.from("media").remove(paths);
}

export async function POST(req: NextRequest) {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: Rec | null;
  try {
    body = record(await readBoundedJson(req,20*1024));
  } catch(error) {
    if(error instanceof BodyTooLargeError)return NextResponse.json({error:'request_body_too_large'},{status:413});
    body = null;
  }
  const id = body?.id,
    batch = body?.batch,
    note = body?.reviewNote;
  if (
    typeof id !== "string" ||
    !UUID_SHAPE.test(id) ||
    typeof batch !== "boolean" ||
    (note !== null && note !== undefined && typeof note !== "string") ||
    (typeof note === "string" && note.length > 4000) ||
    typeof body?.manual !== "boolean"
  )
    return NextResponse.json({ error: "invalid_fields" }, { status: 400 });
  const caller = callerClient(auth.jwt),
    claimId = randomUUID();
  // The SQL gate resolves fiche ownership, pending changes, registered documents and
  // current moderation rights as the CALLER, before the first privileged file read.
  const context = await caller
    .schema("api")
    .rpc("prepare_portal_photo_approval", {
      p_id: id,
      p_batch: batch,
      p_claim_id: claimId,
    });
  const data = record(context.data);
  if (context.error || !data || !Array.isArray(data.documents))
    return NextResponse.json(
      { error: context.error?.code === "PT409" ? "conflict" : "forbidden" },
      { status: context.error?.code === "PT409" ? 409 : 403 },
    );
  if(!batch&&data.alreadyApplied===true&&data.documents.length===0)return NextResponse.json({success:true,id,status:'applied',alreadyApplied:true},{headers:{'Cache-Control':'private, no-store'}});
  try {
    for (const value of data.documents) {
      const doc = record(value),
        docId = doc?.id;
      if (
        !doc ||
        typeof docId !== "string" ||
        !UUID_SHAPE.test(docId) ||
        doc.bucket !== PRIVATE_BUCKET ||
        typeof doc.path !== "string" ||
        !doc.path.startsWith("portal-photos/") ||
        doc.publicPath !== `portal-approved/${docId}.jpg`
      )
        throw Error("invalid_registered_photo");
      const privateFile = await auth.server.storage
        .from(PRIVATE_BUCKET)
        .download(doc.path);
      if (
        privateFile.error ||
        !privateFile.data ||
        privateFile.data.size > MAX_INPUT_BYTES
      )
        throw Error("private_read_failed");
      const publicBucket = auth.server.storage.from("media");
      const copied = await publicBucket.upload(
        doc.publicPath,
        Buffer.from(await privateFile.data.arrayBuffer()),
        { contentType: "image/jpeg", cacheControl: "3600", upsert: true },
      );
      if (copied.error) throw Error("publication_copy_failed");
      const publicUrl = publicBucket.getPublicUrl(doc.publicPath).data
        .publicUrl;
      const current = await auth.server
        .from("ref_document")
        .select("extra")
        .eq("id", docId)
        .maybeSingle();
      const extra = record(current.data?.extra);
      if (current.error || extra?.approval_claim_id !== claimId)
        throw Error("approval_claim_lost");
      const ready = await auth.server
        .from("ref_document")
        .update({
          extra: { ...extra, public_url: publicUrl, publication_ready: true },
        })
        .eq("id", docId)
        .eq("extra->>approval_claim_id", claimId)
        .select("id")
        .single();
      if (ready.error || !ready.data?.id)
        throw Error("publication_registration_failed");
    }
    const approved = await caller
      .schema("api")
      .rpc(
        batch ? "approve_fiche_submission" : "approve_pending_change",
        batch
          ? {
              p_submission_id: id,
              p_review_note: note ?? null,
              p_include_manual: body.manual,
            }
          : {
              p_id: id,
              p_review_note: note ?? null,
              p_applied_manually: body.manual,
            },
      );
    if (approved.error) throw Error("approval_failed");
    return NextResponse.json(approved.data ?? {}, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    // If SQL succeeded but its response was lost, compensation returns no canonical
    // media paths; a retry reads the already applied change instead of deleting it.
    await compensate(auth.server, claimId).catch(() => undefined);
    return NextResponse.json(
      {
        error: "photo_approval_failed",
        detail:
          "La validation des photos n’a pas pu être confirmée. Actualisez la relecture avant de réessayer.",
      },
      { status: 500 },
    );
  }
}
