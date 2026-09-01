import { NextResponse, type NextRequest } from 'next/server';
import { UUID_SHAPE, authenticated } from '../../_document-auth';
import { authorizeActor } from '../authorize';

// URL signée (60 s) d'un document privé d'acteur. Socle d'authentification commun aux deux
// familles de routes documents (../../_document-auth), gate propre à l'acteur (../authorize).
//
// Le gate est celui de LECTURE — `authorizeActor(..., write = false)` — à la différence des
// trois verbes d'/api/actor-document : consulter une pièce jointe n'exige pas de pouvoir la
// modifier. Il PRÉCÈDE toute lecture et toute signature.

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticated(req);
  if (!auth.ok) return auth.response;
  let body: { actorId?: string; documentId?: string };
  try { body = await req.json() as typeof body; } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const actorId = body.actorId ?? '';
  const documentId = body.documentId ?? '';
  if (!UUID_SHAPE.test(actorId) || !UUID_SHAPE.test(documentId)) return NextResponse.json({ error: 'invalid_fields' }, { status: 400 });

  if (!await authorizeActor(auth.jwt, actorId, false)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

  const { data: link } = await auth.server.from('actor_document')
    .select('document_id')
    .eq('actor_id', actorId)
    .eq('document_id', documentId)
    .maybeSingle();
  if (!link) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const { data: document } = await auth.server.from('ref_document')
    .select('storage_bucket, storage_path')
    .eq('id', documentId)
    .maybeSingle();
  const bucket = String((document as { storage_bucket?: string } | null)?.storage_bucket ?? '');
  const path = String((document as { storage_path?: string } | null)?.storage_path ?? '');
  if (!bucket || !path) return NextResponse.json({ error: 'file_missing' }, { status: 404 });
  const { data, error } = await auth.server.storage.from(bucket).createSignedUrl(path, 60);
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'signed_url_failed', detail: error?.message }, { status: 500 });
  return NextResponse.json({ url: data.signedUrl });
}
