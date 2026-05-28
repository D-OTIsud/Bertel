import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { handleMediaUpload, type StorageUploader } from './handle-upload';
import { MediaProcessingError } from './process-image';

const BUCKET = 'media';

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
