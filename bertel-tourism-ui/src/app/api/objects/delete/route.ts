import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// §108 — Suppression définitive d'une fiche (admin-only). Orchestration (calque /api/rgpd/erase) :
//   1. exécuter api.rpc_delete_object EN TANT QU'APPELANT → la garde superuser
//      (api.is_platform_superuser) s'applique côté serveur ; la suppression relationnelle = CASCADE.
//   2. avec la clé service-role, supprimer les fichiers Storage rapportés (media + documents) — ils
//      n'ont pas de FK cascade et resteraient orphelins sinon.

const MEDIA_BUCKET = 'media';
const DOCUMENTS_BUCKET = 'documents';

interface DeleteReport {
  media_to_delete?: string[];
  documents_to_delete?: string[];
  [key: string]: unknown;
}

/** Extrait le chemin in-bucket d'une URL publique Supabase ; null si l'URL est externe. */
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  try { return decodeURIComponent(path); } catch { return path; }
}

async function sweepBucket(
  server: SupabaseClient,
  bucket: string,
  urls: unknown,
): Promise<{ deleted: string[]; error: string | null }> {
  const paths = (Array.isArray(urls) ? urls : [])
    .map((u) => (typeof u === 'string' ? storagePathFromPublicUrl(u, bucket) : null))
    .filter((p): p is string => p !== null);
  if (paths.length === 0) return { deleted: [], error: null };
  const { error } = await server.storage.from(bucket).remove(paths);
  return error ? { deleted: [], error: error.message } : { deleted: paths, error: null };
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: unknown;
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'bad_json' }, { status: 400 }); }
  const b = (body ?? {}) as Record<string, unknown>;
  const objectId = b.objectId;
  const confirmName = b.confirmName;
  if (typeof objectId !== 'string' || objectId.trim().length === 0) {
    return NextResponse.json({ error: 'missing_object_id' }, { status: 400 });
  }
  if (typeof confirmName !== 'string' || confirmName.length === 0) {
    return NextResponse.json({ error: 'missing_confirm_name' }, { status: 400 });
  }

  // Step 1 — supprimer EN TANT QU'APPELANT (la garde superuser du RPC s'applique côté serveur).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rpcData, error: rpcErr } = await asCaller
    .schema('api')
    .rpc('rpc_delete_object', { p_object_id: objectId, p_confirm_name: confirmName });
  if (rpcErr) {
    const msg = rpcErr.message ?? 'delete_failed';
    // 'FORBIDDEN:' = garde superuser → 403. 'FORBIDDEN_ORG:' / MUST_ARCHIVE_FIRST / NAME_MISMATCH / NOT_FOUND → 400.
    const forbidden = /FORBIDDEN:|administrateurs plateforme/i.test(msg);
    return NextResponse.json({ error: 'delete_failed', detail: msg }, { status: forbidden ? 403 : 400 });
  }

  const report = (rpcData ?? {}) as DeleteReport;

  // Step 2 — balayer le Storage (service-role) sur les deux buckets.
  const media = await sweepBucket(server, MEDIA_BUCKET, report.media_to_delete);
  const docs = await sweepBucket(server, DOCUMENTS_BUCKET, report.documents_to_delete);

  return NextResponse.json(
    {
      ok: true,
      report,
      mediaDeleted: media.deleted,
      documentsDeleted: docs.deleted,
      storageError: media.error ?? docs.error,
    },
    { status: 200 },
  );
}
