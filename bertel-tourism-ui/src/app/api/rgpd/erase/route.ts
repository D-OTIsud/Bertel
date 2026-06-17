import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';

// RGPD Art. 17 erasure endpoint. Orchestrates the SQL capability (migration_gdpr_erasure.sql):
//   1. authorize the caller, then call api.rpc_gdpr_erase_subject AS THE CALLER so the RPC's
//      own gate (api.is_platform_superuser) enforces the superuser/référent boundary;
//   2. with the service-role key, delete the Storage files the RPC reports (media has no FK
//      cascade — the row is gone but the bucket object would otherwise linger as an orphan);
//   3. for kind='user' + mode='delete', delete the auth.users account via the Admin API
//      (the SQL only anonymises app_user_profile — auth.users lives outside SQL reach).
// Proportionate by design: the RPC acts per identified subject, never the public referential.

const SUBJECT_KINDS = ['actor', 'incident', 'review', 'object_legal', 'contact_channel', 'user'] as const;
type SubjectKind = (typeof SUBJECT_KINDS)[number];
const MODES = ['anonymize', 'delete'] as const;
type Mode = (typeof MODES)[number];

const MEDIA_BUCKET = 'media';

interface EraseReport {
  media_to_delete?: string[];
  [key: string]: unknown;
}

/** Extract the in-bucket object path from a Supabase public URL; null if the URL is external. */
function storagePathFromPublicUrl(url: string, bucket: string): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i === -1) return null;
  const path = url.slice(i + marker.length).split('?')[0];
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

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

  // Body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const b = (body ?? {}) as Record<string, unknown>;
  const subjectKind = b.subjectKind;
  const subjectId = b.subjectId;
  const mode = (b.mode as string | undefined) ?? 'anonymize';
  const reason = typeof b.reason === 'string' ? b.reason : null;

  if (typeof subjectKind !== 'string' || !SUBJECT_KINDS.includes(subjectKind as SubjectKind)) {
    return NextResponse.json({ error: 'invalid_subject_kind' }, { status: 400 });
  }
  if (typeof subjectId !== 'string' || subjectId.trim().length === 0) {
    return NextResponse.json({ error: 'missing_subject_id' }, { status: 400 });
  }
  if (!MODES.includes(mode as Mode)) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }

  // Step 1 — run the erasure AS THE CALLER (the RPC gate enforces superuser/référent).
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: rpcData, error: rpcErr } = await asCaller
    .schema('api')
    .rpc('rpc_gdpr_erase_subject', {
      p_subject_kind: subjectKind,
      p_subject_id: subjectId,
      p_mode: mode,
      p_reason: reason,
    });
  if (rpcErr) {
    // The gate raises a French message; map an authorization failure to 403, the rest to 400.
    const msg = rpcErr.message ?? 'erase_failed';
    const forbidden = /administrateurs plateforme|permission|not allowed|denied/i.test(msg);
    return NextResponse.json({ error: 'erase_failed', detail: msg }, { status: forbidden ? 403 : 400 });
  }

  const report = (rpcData ?? {}) as EraseReport;

  // Step 2 — delete the reported Storage files (service-role; only our own bucket objects).
  const mediaUrls = Array.isArray(report.media_to_delete) ? report.media_to_delete : [];
  const paths = mediaUrls
    .map((u) => (typeof u === 'string' ? storagePathFromPublicUrl(u, MEDIA_BUCKET) : null))
    .filter((p): p is string => p !== null);
  let storageDeleted: string[] = [];
  let storageError: string | null = null;
  if (paths.length > 0) {
    const { error: rmErr } = await server.storage.from(MEDIA_BUCKET).remove(paths);
    if (rmErr) {
      storageError = rmErr.message;
    } else {
      storageDeleted = paths;
    }
  }

  // Step 3 — for a user hard-delete, remove the auth.users account (Admin API, outside SQL).
  let authUserDeleted = false;
  let authError: string | null = null;
  if (subjectKind === 'user' && mode === 'delete') {
    const { error: delErr } = await server.auth.admin.deleteUser(subjectId);
    if (delErr) {
      authError = delErr.message;
    } else {
      authUserDeleted = true;
    }
  }

  return NextResponse.json(
    { ok: true, report, storageDeleted, storageError, authUserDeleted, authError },
    { status: 200 },
  );
}
