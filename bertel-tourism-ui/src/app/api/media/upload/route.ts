import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { handleMediaUpload, type StorageUploader } from './handle-upload';
import { MediaProcessingError } from './process-image';

const BUCKET = 'media';
const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape in schema_unified.sql

export const runtime = 'nodejs'; // sharp requires Node, not Edge

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
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

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
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

  const fileBuffer = Buffer.from(await file.arrayBuffer());

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
