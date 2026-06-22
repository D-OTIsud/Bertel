import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// §108 — Suppression définitive d'une fiche (admin-only).
//
// AUTORISATION = être superadmin plateforme. Elle est imposée CÔTÉ SERVEUR par
// api.rpc_delete_object (SECURITY DEFINER : auth.uid() + api.is_platform_superuser()), que la
// route exécute EN TANT QU'APPELANT via le client anon porteur du JWT. La suppression en base ne
// dépend QUE de cette garde — PAS de la clé service-role.
//
// La SUPABASE_SERVICE_ROLE_KEY n'autorise rien : elle sert UNIQUEMENT à supprimer les FICHIERS du
// bucket Storage (verrouillé par une RLS RESTRICTIVE — seule la service-role peut y écrire). Le
// nettoyage des fichiers est donc « best-effort » : si la clé est absente, l'objet est tout de
// même supprimé en base et les fichiers sont laissés au GC différé (leurs URLs restent
// journalisées dans object_deletion_log.report pour un nettoyage ultérieur). Voir CLAUDE.md
// « Suppression définitive d'une fiche » + décision log §108.

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
  // Le client appelant n'utilise que la config PUBLIQUE (URL + anon) — toujours présente quand
  // l'app tourne. La clé service-role n'est PAS requise pour autoriser/exécuter la suppression.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  if (!url || !anon) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY missing' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // Client anon porteur du JWT : sert à valider le JWT ET à exécuter le RPC superuser-gated.
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userErr } = await asCaller.auth.getUser(jwt);
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

  // 1. Suppression EN BASE — autorisée par la SEULE garde superuser du RPC (zéro service key).
  //    'FORBIDDEN:' = garde superuser → 403. Les autres erreurs (FORBIDDEN_ORG / MUST_ARCHIVE_FIRST
  //    / NAME_MISMATCH / NOT_FOUND / NO_AUTH_CONTEXT) → 400.
  const { data: rpcData, error: rpcErr } = await asCaller
    .schema('api')
    .rpc('rpc_delete_object', { p_object_id: objectId, p_confirm_name: confirmName });
  if (rpcErr) {
    const msg = rpcErr.message ?? 'delete_failed';
    const forbidden = /FORBIDDEN:|administrateurs plateforme/i.test(msg);
    return NextResponse.json({ error: 'delete_failed', detail: msg }, { status: forbidden ? 403 : 400 });
  }

  const report = (rpcData ?? {}) as DeleteReport;

  // 2. Nettoyage des fichiers Storage — BEST-EFFORT (service-role). Si la clé manque, l'objet est
  //    déjà supprimé en base ; on saute le balayage et on le signale (storageSkipped). Les fichiers
  //    orphelins sont rattrapables par le GC (URLs conservées dans object_deletion_log.report).
  const server = getServerSupabaseClient();
  let mediaDeleted: string[] = [];
  let documentsDeleted: string[] = [];
  let storageError: string | null = null;
  let storageSkipped = false;
  if (server) {
    const media = await sweepBucket(server, MEDIA_BUCKET, report.media_to_delete);
    const docs = await sweepBucket(server, DOCUMENTS_BUCKET, report.documents_to_delete);
    mediaDeleted = media.deleted;
    documentsDeleted = docs.deleted;
    storageError = media.error ?? docs.error;
  } else {
    storageSkipped = true;
  }

  return NextResponse.json(
    { ok: true, report, mediaDeleted, documentsDeleted, storageError, storageSkipped },
    { status: 200 },
  );
}
