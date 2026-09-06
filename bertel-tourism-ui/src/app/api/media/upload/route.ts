import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { handleMediaUpload, type StorageUploader } from './handle-upload';
import { MediaProcessingError, MAX_INPUT_BYTES } from './process-image';
import { MAX_VIDEO_INPUT_BYTES } from './process-video';
import {
  readBoundedFormData,
  assertFormDataShape,
  FormDataShapeError,
  BodyTooLargeError,
  acquireLease,
  SEMAPHORE_RETRY_AFTER_SECONDS,
} from '@/lib/request-body.server';

const BUCKET = 'media';
const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape in schema_unified.sql
// Raw multipart envelope: largest accepted single file (video) + 1 MiB for the boundary/field
// overhead. Rejected BEFORE the multipart parser runs — see readBoundedFormData.
const MAX_MULTIPART_BYTES = MAX_VIDEO_INPUT_BYTES + 1024 * 1024;

export const runtime = 'nodejs'; // sharp requires Node, not Edge

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured' } /* cause serveur : SUPABASE_SERVICE_ROLE_KEY missing */,
      { status: 500 },
    );
  }

  // Auth: require a Bearer JWT from the authenticated browser client.
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
  return handleAuthenticatedUpload(req, server, jwt).finally(() => lease.release());
}

async function handleAuthenticatedUpload(
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
    assertFormDataShape(form, { allowedFields: ['file', 'object_id'] });
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

  // Authorize AS THE CALLER (admin/invite pattern): the storage write below runs
  // with the service-role key (bypasses RLS), so this probe is the per-object
  // boundary — without it any logged-in user could fill any object's storage
  // prefix. Same predicate as every canonical write policy (CLAUDE.md
  // write-path invariant). Fail-closed on probe errors.
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
    return NextResponse.json(
      { error: 'forbidden', detail: 'caller cannot edit this object' },
      { status: 403 },
    );
  }

  const uploader: StorageUploader = {
    async upload(path, buffer, contentType) {
      const { error } = await server.storage.from(BUCKET).upload(path, buffer, {
        contentType,
        cacheControl: '31536000', // 1 year — paths are uuid'd so safe to cache
        upsert: false,
      });
      if (error) return { ok: false, error: error.message };
      const { data } = server.storage.from(BUCKET).getPublicUrl(path);
      return { ok: true, publicUrl: data.publicUrl };
    },
  };

  try {
    // Declared-size preflight BEFORE arrayBuffer(): the multipart envelope alone (sized for
    // the largest accepted file, a 100 MiB video) would otherwise let a 99 MiB IMAGE be fully
    // buffered before processImage's own 20 MiB check rejects it. `file.size` is metadata from
    // the multipart parser (no bytes read yet); the real MIME/decode validation downstream is
    // unchanged and remains authoritative — this only avoids buffering what will certainly fail.
    const isVideo = file.type.startsWith('video/');
    const maxDeclaredBytes = isVideo ? MAX_VIDEO_INPUT_BYTES : MAX_INPUT_BYTES;
    if (file.size > maxDeclaredBytes) {
      throw new MediaProcessingError(
        'size',
        isVideo
          ? `Vidéo trop volumineuse (max ${Math.round(MAX_VIDEO_INPUT_BYTES / (1024 * 1024))} Mo).`
          : `Image trop volumineuse (max ${Math.round(MAX_INPUT_BYTES / (1024 * 1024))} Mo).`,
      );
    }
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const result = await handleMediaUpload({
      fileBuffer,
      filename: file.name,
      mimeType: file.type,
      objectId,
      uploader,
    });
    return NextResponse.json(result, { status: 201 });
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
