import { NextResponse, type NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
// Single source of truth for image processing (resize-down + EXIF/IPTC/XMP strip via sharp's
// default re-encode — process-image.test.ts is the regression guard). We deliberately reuse
// the media pipeline's helper rather than re-implementing the strip: ONE place opts out of
// `.withMetadata()`. Portraits ride the same ≤ 2000 px cap (a face is fine at that size).
import { processImage, MediaProcessingError } from '../../media/upload/process-image';

const BUCKET = 'media';

export const runtime = 'nodejs'; // sharp requires Node, not Edge

// PII: actor portrait — consent tracking deferred (actor_consent). The bucket is public but
// the path is uuid'd (unguessable), same posture as object media — acceptable for MVP.
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
  const actorId = form.get('actorId');
  if (!(file instanceof File) || typeof actorId !== 'string' || actorId.length === 0) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  // Authorize AS THE CALLER (media-pipeline invariant): the storage write + actor UPDATE
  // below run with the service-role key (bypass RLS), so THIS probe is the per-actor
  // boundary. Same predicate as save_crm_actor's edit gate (user_can_write_crm_actor).
  // false OR probe error ⇒ 403 (fail-closed).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: canWrite, error: canWriteErr } = await asCaller
    .schema('api')
    .rpc('user_can_write_crm_actor', { p_actor_id: actorId });
  if (canWriteErr || canWrite !== true) {
    return NextResponse.json(
      { error: 'forbidden', detail: 'caller cannot edit this actor' },
      { status: 403 },
    );
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  try {
    // Validate MIME + decode + resize-down + strip EXIF/IPTC/XMP (output jpg).
    const processed = await processImage({ buffer: fileBuffer, mimeType: file.type });

    // Service-role storage write (bypasses the RESTRICTIVE bucket RLS) under actors/{id}/.
    const path = `actors/${actorId}/${randomUUID()}.jpg`;
    const { error: uploadErr } = await server.storage.from(BUCKET).upload(path, processed.buffer, {
      contentType: processed.mimeType,
      cacheControl: '31536000', // 1 year — uuid'd path, safe to cache
      upsert: false,
    });
    if (uploadErr) {
      return NextResponse.json({ error: 'upload_failed', detail: uploadErr.message }, { status: 500 });
    }
    const { data: pub } = server.storage.from(BUCKET).getPublicUrl(path);
    const publicUrl = pub.publicUrl;

    // Single writer of actor.photo_url for the upload path (the caller is already
    // authorized above; this write runs service-role like every storage write in the route).
    const { error: updateErr } = await server.from('actor').update({ photo_url: publicUrl, updated_at: new Date().toISOString() }).eq('id', actorId);
    if (updateErr) {
      return NextResponse.json({ error: 'update_failed', detail: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ url: publicUrl }, { status: 201 });
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
