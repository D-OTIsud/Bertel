import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
// Reuse the media image pipeline for scanned-certificate images (resize ≤ 2000 px +
// EXIF/IPTC/XMP strip). PDFs are validated and stored as-is (validateDocument).
import { processImage, MediaProcessingError, MAX_INPUT_BYTES } from '../../media/upload/process-image';
import { validateDocument, MAX_DOCUMENT_INPUT_BYTES } from './process-document';
import {
  readBoundedFormData,
  assertFormDataShape,
  FormDataShapeError,
  BodyTooLargeError,
  acquireLease,
  SEMAPHORE_RETRY_AFTER_SECONDS,
} from '@/lib/request-body.server';

const BUCKET = 'documents';
const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape
// Raw multipart envelope: largest accepted single file (image, 20 MiB) + 1 MiB overhead.
// PDFs are capped lower (10 MiB, see process-document.ts) but share this route's raw ceiling.
const MAX_MULTIPART_BYTES = MAX_INPUT_BYTES + 1024 * 1024;

export const runtime = 'nodejs'; // sharp requires Node, not Edge

/**
 * Justificatif upload for §08 classifications/labels. Mirrors /api/media/upload:
 * authorizes AS THE CALLER (user_can_write_object_canonical) — the storage write +
 * ref_document insert below run service-role (bypass RLS), so this probe is the
 * per-object boundary. Accepts PDF (stored as-is) or an image (re-encoded jpg).
 * Creates a ref_document row and returns its id for object_classification.document_id.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured' } /* cause serveur : SUPABASE_SERVICE_ROLE_KEY missing */,
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  const lease = acquireLease('upload');
  if (!lease) {
    return NextResponse.json(
      { error: 'too_many_requests', detail: 'Trop de téléversements en cours, réessayez.' },
      { status: 429, headers: { 'Retry-After': String(SEMAPHORE_RETRY_AFTER_SECONDS) } },
    );
  }
  try {
    return await handlePostAuthenticated(req, server, jwt);
  } finally {
    lease.release();
  }
}

async function handlePostAuthenticated(
  req: NextRequest,
  server: NonNullable<ReturnType<typeof getServerSupabaseClient>>,
  jwt: string,
): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await readBoundedFormData(req, MAX_MULTIPART_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: 'request_body_too_large', detail: 'Le fichier envoyé dépasse la taille maximale autorisée.' },
        { status: 413 },
      );
    }
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
  }
  try {
    assertFormDataShape(form, { allowedFields: ['file', 'object_id', 'title'] });
  } catch (err) {
    if (err instanceof FormDataShapeError) return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
    throw err;
  }
  const file = form.get('file');
  const objectId = form.get('object_id');
  if (!(file instanceof File) || typeof objectId !== 'string' || objectId.length === 0) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }
  if (!OBJECT_ID_SHAPE.test(objectId)) {
    return NextResponse.json({ error: 'invalid_object_id', detail: 'object_id does not match the canonical shape' }, { status: 400 });
  }

  // Authorize AS THE CALLER (media-pipeline invariant): same predicate as every canonical
  // write policy. The service-role writes below are gated by THIS probe. Fail-closed on error.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: canWrite, error: canWriteErr } = await asCaller
    .schema('api')
    .rpc('user_can_write_object_canonical', { p_object_id: objectId });
  if (canWriteErr || canWrite !== true) {
    return NextResponse.json({ error: 'forbidden', detail: 'caller cannot edit this object' }, { status: 403 });
  }

  const isPdf = file.type === 'application/pdf';

  try {
    // Declared-size preflight BEFORE arrayBuffer(): the envelope alone (sized for the larger
    // of the two accepted kinds, a 20 MiB image) would otherwise let an oversized declared PDF
    // be fully buffered before validateDocument's own 10 MiB check rejects it downstream.
    const maxDeclaredBytes = isPdf ? MAX_DOCUMENT_INPUT_BYTES : MAX_INPUT_BYTES;
    if (file.size > maxDeclaredBytes) {
      throw new MediaProcessingError(
        'size',
        isPdf
          ? `Document exceeds ${MAX_DOCUMENT_INPUT_BYTES} bytes`
          : `Image trop volumineuse (max ${Math.round(MAX_INPUT_BYTES / (1024 * 1024))} Mo).`,
      );
    }
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    let storedBuffer: Buffer;
    let contentType: string;
    let ext: string;
    if (isPdf) {
      validateDocument({ buffer: fileBuffer, mimeType: file.type });
      storedBuffer = fileBuffer;
      contentType = 'application/pdf';
      ext = 'pdf';
    } else {
      // Image scan → resize-down + strip metadata, output jpg (throws on non-image MIME).
      const processed = await processImage({ buffer: fileBuffer, mimeType: file.type });
      storedBuffer = processed.buffer;
      contentType = processed.mimeType;
      ext = 'jpg';
    }

    const path = `${objectId}/${randomUUID()}.${ext}`;
    const { error: uploadErr } = await server.storage.from(BUCKET).upload(path, storedBuffer, {
      contentType,
      cacheControl: '31536000',
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json({ error: 'upload_failed', detail: uploadErr.message }, { status: 500 });
    }
    const { data: pub } = server.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // ref_document is admin-write (RLS); the caller is already authorized above and this
    // insert runs service-role like every storage write in the route.
    const titleForm = form.get('title');
    const title = typeof titleForm === 'string' && titleForm.trim() ? titleForm.trim() : file.name;
    const { data: doc, error: docErr } = await server
      .from('ref_document')
      .insert({ url: publicUrl, title })
      .select('id')
      .single();
    if (docErr || !doc) {
      return NextResponse.json({ error: 'document_create_failed', detail: docErr?.message ?? 'no row' }, { status: 500 });
    }

    return NextResponse.json({ documentId: (doc as { id: string }).id, url: publicUrl, title }, { status: 201 });
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      const status = err.code === 'mime' || err.code === 'size' ? 415 : 400;
      return NextResponse.json({ error: err.code, detail: err.message }, { status });
    }
    return NextResponse.json(
      { error: 'upload_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
