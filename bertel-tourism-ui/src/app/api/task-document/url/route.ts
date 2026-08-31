import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// URL signée (60 s) d'une pièce jointe de tâche CRM (17i) — clone d'actor-document/url :
// gate « en tant qu'appelant » via le RPC d'écriture (voir route.ts : les trois verbes
// documents partagent le même prédicat, il n'y a pas de surface lecture seule ici), lecture
// du chemin storage en service_role (RLS interdit toute lecture directe des tables CRM par
// l'appelant), URL signée émise par le service_role.
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userError } = await server.auth.getUser(jwt);
  if (userError || !userData.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  let body: { taskId?: string; documentId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const taskId = body.taskId ?? '';
  const documentId = body.documentId ?? '';
  if (!UUID_SHAPE.test(taskId) || !UUID_SHAPE.test(documentId)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });

  const asCaller = createClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(),
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { data: canWrite, error: gateError } = await asCaller
    .schema('api')
    .rpc('user_can_write_crm_task', { p_task_id: taskId });
  if (gateError || canWrite !== true) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  // Vérifié sur LA PAIRE (task_id, document_id) : un documentId valide mais rattaché à une
  // autre tâche que celle gatée ci-dessus ne doit jamais produire d'URL signée.
  const { data: link } = await server.from('crm_task_document')
    .select('document_id')
    .eq('task_id', taskId)
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
