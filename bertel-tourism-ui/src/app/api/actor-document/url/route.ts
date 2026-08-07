import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userError } = await server.auth.getUser(jwt);
  if (userError || !userData.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let body: { actorId?: string; documentId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const actorId = body.actorId ?? '';
  const documentId = body.documentId ?? '';
  if (!UUID_SHAPE.test(actorId) || !UUID_SHAPE.test(documentId)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });

  const asCaller = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: canRead, error: gateError } = await asCaller
    .schema('api')
    .rpc('user_can_read_crm_actor', { p_actor_id: actorId });
  if (gateError || canRead !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: link } = await server.from('actor_document')
    .select('document_id')
    .eq('actor_id', actorId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data: document } = await server.from('ref_document')
    .select('storage_bucket, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  const bucket = String((document as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const path = String((document as { storage_path?: string } | null)?.storage_path ?? '');
  if (!bucket || !path) return NextResponse.json({ error: 'file_missing' }, { status: 404 });
  const { data, error } = await server.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'signed_url_failed', detail: error?.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
