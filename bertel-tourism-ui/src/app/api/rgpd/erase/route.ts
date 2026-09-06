import { NextResponse, type NextRequest } from 'next/server';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { readBoundedJson, BodyTooLargeError } from '@/lib/request-body.server';

// RGPD Art. 17 erasure endpoint. Orchestrates the durable SQL capability
// (supabase/migrations/20260905195257_gdpr_cleanup_operations.sql):
//   START (subjectKind/subjectId/mode/reason) — calls api.rpc_gdpr_erase_subject AS THE CALLER
//     (its own gate enforces the superuser/référent boundary), then processes the returned
//     operation's cleanup tasks (Storage removal / Auth deletion).
//   RESUME (operationId only) — reloads the recorded operation via
//     api.rpc_gdpr_get_cleanup_status and processes only its outstanding tasks. NEVER calls
//     api.rpc_gdpr_erase_subject again — resuming must not re-erase a subject that may already
//     be gone.
// Both branches require the caller to be an authenticated platform superuser, checked here in
// addition to (never instead of) the SQL RPC's own gate — api.rpc_gdpr_get_cleanup_status /
// api.rpc_gdpr_ack_cleanup_task have NO caller-level authorization of their own (service_role
// only), so this route-level check is the ONLY boundary protecting resume. An auth_delete task
// is re-verified against the CURRENT profile state at execution time (never trusted from the
// moment the operation was first created) — the target may since have been promoted, or the
// resuming caller may differ from the original caller. Every status/refresh RPC read is wrapped
// so a transport exception can never crash the route or lose a committed operationId.
export const runtime = 'nodejs';

const SUBJECT_KINDS = ['actor', 'incident', 'review', 'object_legal', 'contact_channel', 'user'] as const;
type SubjectKind = (typeof SUBJECT_KINDS)[number];
const MODES = ['anonymize', 'delete'] as const;
type Mode = (typeof MODES)[number];
const TASK_ACTIONS = ['storage_remove', 'auth_delete'] as const;
const TASK_STATUSES = ['pending', 'succeeded', 'failed'] as const;
/** Mirrors app_user_profile's role CHECK (schema_unified.sql) — NULL and 'tourism_agent' are
 *  ordinary. Any other value is treated as unknown/untrusted, never silently as "ordinary". */
const KNOWN_PROFILE_ROLES = new Set(['tourism_agent', 'super_admin', 'owner']);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Whole-body ceiling: this route only ever carries a handful of short scalar fields. */
const MAX_JSON_BODY_BYTES = 16 * 1024;

/** Buckets this route is ever allowed to remove objects from. */
const ALLOWED_BUCKETS = new Set(['media', 'avatars', 'actor-documents', 'documents']);

interface CleanupTask {
  id: string;
  action: 'storage_remove' | 'auth_delete';
  metadata: Record<string, unknown>;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  lastError: string | null;
}

interface OperationStatus {
  operationId: string;
  subjectKind: string;
  subjectId: string;
  mode: string;
  reason: string | null;
  performedBy: string | null;
  performedAt: string;
  report: Record<string, unknown>;
  tasks: CleanupTask[];
}

type ServerClient = NonNullable<ReturnType<typeof getServerSupabaseClient>>;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Strict envelope validator for api.rpc_gdpr_get_cleanup_status's return value. Rejects
 * anything malformed or whose operationId doesn't match what was requested — a wrong/mismatched
 * envelope is NEVER trusted, and a rejected envelope must never be read as "0 tasks = done".
 * Task metadata is only checked for shape here (plain object) — its CONTENTS are validated by
 * the storage/auth helpers right before they would ever be acted on, never executed as-is.
 */
function validateOperationStatus(value: unknown, expectedOperationId: string): OperationStatus | null {
  if (!isPlainObject(value)) return null;
  if (typeof value.operationId !== 'string' || !UUID_RE.test(value.operationId) || value.operationId.toLowerCase() !== expectedOperationId.toLowerCase()) {
    return null;
  }
  if (typeof value.subjectKind !== 'string' || !SUBJECT_KINDS.includes(value.subjectKind as SubjectKind)) return null;
  if (typeof value.mode !== 'string' || !MODES.includes(value.mode as Mode)) return null;
  if (typeof value.subjectId !== 'string' || !UUID_RE.test(value.subjectId)) return null;
  if (!isPlainObject(value.report)) return null;
  if (!Array.isArray(value.tasks)) return null;

  const tasks: CleanupTask[] = [];
  for (const raw of value.tasks) {
    if (!isPlainObject(raw)) return null;
    if (typeof raw.id !== 'string' || !UUID_RE.test(raw.id)) return null;
    if (typeof raw.action !== 'string' || !TASK_ACTIONS.includes(raw.action as CleanupTask['action'])) return null;
    if (typeof raw.status !== 'string' || !TASK_STATUSES.includes(raw.status as CleanupTask['status'])) return null;
    if (!isPlainObject(raw.metadata)) return null;
    tasks.push({
      id: raw.id,
      action: raw.action as CleanupTask['action'],
      status: raw.status as CleanupTask['status'],
      metadata: raw.metadata,
      attempts: typeof raw.attempts === 'number' ? raw.attempts : 0,
      lastError: typeof raw.lastError === 'string' ? raw.lastError : null,
    });
  }

  return {
    operationId: value.operationId,
    subjectKind: value.subjectKind,
    subjectId: value.subjectId,
    mode: value.mode,
    reason: typeof value.reason === 'string' ? value.reason : null,
    performedBy: typeof value.performedBy === 'string' ? value.performedBy : null,
    performedAt: typeof value.performedAt === 'string' ? value.performedAt : '',
    report: value.report,
    tasks,
  };
}

type StatusFetch = { kind: 'ok'; status: OperationStatus } | { kind: 'not_found' } | { kind: 'error' };

/**
 * Refuse a new erasure until the durable-cleanup migration is available. SQL's
 * `id = NULL` cannot match an operation, so this read neither accesses a real subject
 * nor mutates anything. Only the RPC's explicit P0002 proves the expected contract;
 * a missing function, transport failure or a successful/null response does not.
 * The migration installs this RPC and the new erase body atomically. This probe is
 * not a fingerprint of that body: manual partial deployments/drift still need review.
 */
async function hasDurableCleanupCapability(server: ServerClient): Promise<boolean> {
  try {
    const { data, error } = await server.schema('api').rpc('rpc_gdpr_get_cleanup_status', {
      p_operation_id: null,
    });
    return data === null && isPlainObject(error) && error.code === 'P0002';
  } catch {
    return false;
  }
}

/**
 * Fetch + strictly validate an operation envelope. NEVER throws (a transport exception is
 * treated the same as a returned RPC error) — every status/refresh read in this route goes
 * through this so a promise rejection can never crash the handler or lose a committed
 * operationId. `not_found` is returned ONLY when the RPC reports no error and genuinely no data
 * — an actual error (thrown or returned) is always `error`, never conflated with "not found",
 * and never leaks the raw upstream message to the client.
 */
async function safeGetCleanupStatus(server: ServerClient, operationId: string): Promise<StatusFetch> {
  let data: unknown;
  let error: unknown;
  try {
    const res = await server.schema('api').rpc('rpc_gdpr_get_cleanup_status', { p_operation_id: operationId });
    data = res.data;
    error = res.error;
  } catch {
    return { kind: 'error' };
  }
  if (error) return { kind: 'error' };
  if (data === null || data === undefined) return { kind: 'not_found' };
  const validated = validateOperationStatus(data, operationId);
  return validated ? { kind: 'ok', status: validated } : { kind: 'error' };
}

/** Segment-level path safety: no absolute path, no backslash, no `.`/`..` segment, no control
 *  chars/NUL/DEL. Applied to the fully-decoded path — never to the still-encoded string. */
function isSafeStoragePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\')) return false;
  const segments = path.split('/');
  for (const seg of segments) {
    if (seg.length === 0 || seg === '.' || seg === '..') return false;
    // eslint-disable-next-line no-control-regex -- deliberately screening control chars/NUL/DEL
    if (/[\x00-\x1f\x7f]/.test(seg)) return false;
  }
  return true;
}

const ENCODED_SLASH_OR_BACKSLASH_RE = /%2f|%5c/i;
const RESIDUAL_PERCENT_ENCODING_RE = /%[0-9a-f]{2}/i;

/**
 * Decode a URL path segment exactly ONCE, rejecting anything that would smuggle structure past
 * that single decode: a raw `%2f`/`%5c` (an encoded slash/backslash never legitimately appears
 * inside one segment) is rejected before decoding, and a decoded result that STILL contains a
 * `%XX`-shaped sequence (double encoding, e.g. `%252e%252e` → `.` only visible after a second
 * pass) is rejected after. Returns null for anything unsafe — never a partial/best-effort decode.
 */
function decodeStoragePathSegment(raw: string): string | null {
  if (ENCODED_SLASH_OR_BACKSLASH_RE.test(raw)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (RESIDUAL_PERCENT_ENCODING_RE.test(decoded)) return null;
  return decoded;
}

/**
 * Resolve a Storage object from a Supabase public URL, restricted to OUR configured origin
 * (exact match, no credentials embedded), an allow-listed bucket, and the EXACT
 * `/storage/v1/object/public/` prefix. The dangerous-segment check runs on the RAW url STRING
 * first: the WHATWG `URL` parser silently normalizes `.`/`..` segments out of `pathname` before
 * we would ever get to inspect it, which would make a raw `/../` invisible by the time we read
 * the normalized value — and could resolve it into some OTHER, unrelated object's real path.
 * Any decoding failure or unsafe shape returns null: the caller must treat that as unresolved,
 * never as a local removal.
 */
function resolveStorageTarget(rawUrl: string, supabaseUrl: string): { bucket: string; path: string } | null {
  // Inspecté sur la chaîne BRUTE, avant toute construction d'URL (donc avant normalisation).
  if (/(^|\/)\.\.?(\/|$)/.test(rawUrl) || rawUrl.includes('\\')) return null;
  // URL also normalizes percent-encoded dot segments. Validate the raw path before
  // construction, including each decoded segment, so %2e%2e cannot name another object.
  const rawPath = rawUrl.match(/^https?:\/\/[^/?#]+(\/[^?#]*)/i)?.[1];
  if (!rawPath || rawPath.slice(1).split('/').some(segment => {
    const decoded = decodeStoragePathSegment(segment);
    return decoded === null || !isSafeStoragePath(decoded) || decoded.includes('/');
  })) return null;
  let parsed: URL;
  let origin: URL;
  try {
    parsed = new URL(rawUrl);
    origin = new URL(supabaseUrl);
  } catch {
    return null;
  }
  if (parsed.username || parsed.password) return null; // pas de credentials embarquées
  if (parsed.origin !== origin.origin) return null;
  const marker = '/storage/v1/object/public/';
  if (!parsed.pathname.startsWith(marker)) return null; // préfixe EXACT, pas "contient"
  const rest = parsed.pathname.slice(marker.length);
  const slash = rest.indexOf('/');
  if (slash <= 0) return null;
  const bucket = rest.slice(0, slash);
  if (!ALLOWED_BUCKETS.has(bucket)) return null;
  const decodedPath = decodeStoragePathSegment(rest.slice(slash + 1));
  return decodedPath !== null && isSafeStoragePath(decodedPath) ? { bucket, path: decodedPath } : null;
}

/**
 * Validate a DB-stored {bucket, path} pair. This metadata represents an ALREADY-CANONICAL raw
 * storage key that our own SQL constructed directly (e.g. `<uuid>/avatar.jpg`) — it was never
 * URL-encoded, so it is never decoded here. A literal `%` in it is treated conservatively as
 * suspicious (it could be misread as an encoded separator by some other consumer) and fails
 * closed to "unresolved" rather than guessing whether it's a real character or an encoding.
 */
function storageTargetFromMetadata(
  metadata: Record<string, unknown>,
  supabaseUrl: string,
): { bucket: string; path: string } | null {
  const bucket = metadata.bucket;
  const path = metadata.path;
  if (typeof bucket === 'string' && typeof path === 'string') {
    if (!ALLOWED_BUCKETS.has(bucket)) return null;
    if (path.includes('%')) return null; // clé canonique brute : jamais de % attendu
    return isSafeStoragePath(path) ? { bucket, path } : null;
  }
  const rawUrl = metadata.raw_url;
  return typeof rawUrl === 'string' ? resolveStorageTarget(rawUrl, supabaseUrl) : null;
}

interface AuthDeleteCheck {
  allowed: boolean;
  /** Compte déjà absent côté Auth (404/user_not_found EXPLICITE) : traité comme un succès idempotent. */
  alreadyDeleted?: boolean;
  /** Code borné, jamais un message brut (peut contenir un e-mail/URL). */
  reason?: string;
}

/**
 * Re-verify an auth_delete task against the CURRENT state before executing it — never trust
 * the operation's original snapshot. Strict task/operation association, anti-self, fail-closed
 * profile lookup (unknown role values are REJECTED, never treated as ordinary — same allow-list
 * as /api/admin/delete-user), owner/super_admin guards. Idempotence is decided ONLY from the
 * documented Supabase Admin API error code/status: a "success but no user" response is
 * AMBIGUOUS (not a documented not-found signal) and is treated as a lookup failure, never as an
 * already-deleted success.
 */
async function verifyAuthDeleteAllowed(
  server: ServerClient,
  asCaller: SupabaseClient,
  callerId: string,
  operation: OperationStatus,
  task: CleanupTask,
): Promise<AuthDeleteCheck> {
  if (operation.subjectKind !== 'user' || operation.mode !== 'delete') {
    return { allowed: false, reason: 'task_operation_mismatch' };
  }
  const userId = typeof task.metadata.user_id === 'string' ? task.metadata.user_id : '';
  if (!userId || !UUID_RE.test(userId) || userId.toLowerCase() !== operation.subjectId.toLowerCase()) {
    return { allowed: false, reason: 'task_subject_mismatch' };
  }
  if (userId.toLowerCase() === callerId.toLowerCase()) {
    return { allowed: false, reason: 'self_delete_forbidden' };
  }

  let authErr: { status?: number; code?: string; message?: string } | null = null;
  let authUser: { user?: unknown } | null = null;
  try {
    const res = await server.auth.admin.getUserById(userId);
    authErr = res.error;
    authUser = res.data;
  } catch {
    return { allowed: false, reason: 'auth_lookup_failed' };
  }
  if (authErr) {
    if (authErr.status === 404 || authErr.code === 'user_not_found') {
      return { allowed: false, alreadyDeleted: true, reason: 'already_deleted' };
    }
    return { allowed: false, reason: 'auth_lookup_failed' };
  }
  if (!authUser?.user) {
    // Pas d'erreur MAIS pas d'utilisateur non plus : forme non documentée, ambiguë — jamais
    // interprétée comme "déjà supprimé" sans le code/statut 404 explicite.
    return { allowed: false, reason: 'auth_lookup_failed' };
  }

  const { data: profile, error: profileErr } = await server
    .from('app_user_profile')
    .select('role')
    .eq('id', userId)
    .maybeSingle<{ role: string | null }>();
  if (profileErr || !profile) {
    return { allowed: false, reason: 'target_profile_check_failed' };
  }
  if (profile.role !== null && !KNOWN_PROFILE_ROLES.has(profile.role)) {
    // Valeur de rôle inconnue/inattendue : jamais traitée comme une cible ordinaire.
    return { allowed: false, reason: 'target_profile_check_failed' };
  }
  if (profile.role === 'owner') {
    return { allowed: false, reason: 'owner_delete_forbidden' };
  }
  if (profile.role === 'super_admin') {
    const { data: isOwner, error: ownerErr } = await asCaller.schema('api').rpc('is_platform_owner');
    if (ownerErr || isOwner !== true) {
      return { allowed: false, reason: 'owner_required_for_super_admin_delete' };
    }
  }
  return { allowed: true };
}

/**
 * Execute every non-succeeded task of an operation (Storage removal / Auth deletion), then
 * acknowledge each outcome. Prior succeeded tasks are skipped (idempotent resume). Transport
 * exceptions are caught the same as a returned error. The acknowledgement call itself is
 * wrapped too — a network failure acking a real success must never crash the route after the
 * SQL erasure has already committed; the task's DB status is simply left as-is and a later
 * resume will retry it.
 */
async function processTasks(
  server: ServerClient,
  asCaller: SupabaseClient,
  callerId: string,
  operation: OperationStatus,
): Promise<void> {
  const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();

  for (const task of operation.tasks ?? []) {
    if (task.status === 'succeeded') continue;

    let ok = false;
    let error: string | null = null;
    try {
      if (task.action === 'storage_remove') {
        const target = storageTargetFromMetadata(task.metadata, supabaseUrl);
        if (!target) {
          // Référence externe/invalide : jamais transformée en suppression locale. Marquée en
          // échec (pas un faux succès) — reste visible comme non résolue, revue manuelle requise.
          error = 'unresolved_external_or_invalid_reference';
        } else {
          const { error: rmErr } = await server.storage.from(target.bucket).remove([target.path]);
          ok = !rmErr;
          error = rmErr ? 'storage_remove_failed' : null;
        }
      } else if (task.action === 'auth_delete') {
        const check = await verifyAuthDeleteAllowed(server, asCaller, callerId, operation, task);
        if (check.alreadyDeleted) {
          ok = true; // idempotent : déjà supprimé, considéré comme acquis
        } else if (!check.allowed) {
          error = check.reason ?? 'auth_delete_forbidden';
        } else {
          const userId = task.metadata.user_id as string;
          const { error: delErr } = await server.auth.admin.deleteUser(userId);
          ok = !delErr;
          error = delErr ? 'auth_delete_failed' : null;
        }
      } else {
        error = 'unknown_task_action';
      }
    } catch {
      ok = false;
      error = 'transport_error'; // jamais le message brut (peut contenir une URL/un e-mail)
    }

    try {
      await server.schema('api').rpc('rpc_gdpr_ack_cleanup_task', {
        p_operation_id: operation.operationId,
        p_task_id: task.id,
        p_success: ok,
        p_error: error,
      });
    } catch {
      // L'acquittement lui-même a échoué (réseau) : la tâche reste non acquittée en base,
      // récupérable par une reprise ultérieure — ne jamais faire échouer toute la route pour ça.
    }
  }
}

function buildStatusResponse(status: OperationStatus, cleanupStatusUnavailable = false): NextResponse {
  const tasks = status.tasks ?? [];
  const succeededCount = tasks.filter((t) => t.status === 'succeeded').length;
  const allTasksDone = tasks.every((t) => t.status === 'succeeded');
  const manualReview = (status.report as Record<string, unknown> | undefined)?.manualReviewRequired === true;
  const ok = allTasksDone && !manualReview && !cleanupStatusUnavailable;
  const outcome: 'completed' | 'partial' | 'failed' = ok
    ? 'completed'
    : cleanupStatusUnavailable || succeededCount > 0 || allTasksDone
      ? 'partial'
      : 'failed';

  return NextResponse.json(
    {
      ok,
      status: outcome,
      operationId: status.operationId,
      report: status.report,
      tasks,
      cleanupStatusUnavailable,
      counts: {
        total: tasks.length,
        succeeded: succeededCount,
        pending: tasks.filter((t) => t.status === 'pending').length,
        failed: tasks.filter((t) => t.status === 'failed').length,
      },
    },
    { status: ok ? 200 : 207 },
  );
}

interface AuthorizedCaller {
  callerId: string;
  asCaller: SupabaseClient;
}
type AuthorizeResult = ({ ok: true } & AuthorizedCaller) | { ok: false; response: NextResponse };

/** Fail-closed on ANY ambiguity: an RPC error alongside `data === true` is never trusted, and a
 *  transport exception yields a controlled response instead of an uncaught throw. */
async function authorizeSuperuser(req: NextRequest, server: ServerClient): Promise<AuthorizeResult> {
  try {
    const authHeader = req.headers.get('authorization') ?? '';
    const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
    if (!jwt) return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
    const { data: userData, error: userErr } = await server.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      return { ok: false, response: NextResponse.json({ error: 'unauthenticated' }, { status: 401 }) };
    }
    const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
    const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
    const asCaller = createClient(url, anon, {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: isSuper, error: superErr } = await asCaller.schema('api').rpc('is_platform_superuser');
    if (superErr || isSuper !== true) {
      return { ok: false, response: NextResponse.json({ error: 'platform_superuser_required' }, { status: 403 }) };
    }
    return { ok: true, callerId: userData.user.id, asCaller };
  } catch {
    return { ok: false, response: NextResponse.json({ error: 'authorization_check_failed' }, { status: 500 }) };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  const auth = await authorizeSuperuser(req, server);
  if (!auth.ok) return auth.response;

  let parsed: unknown;
  try {
    parsed = await readBoundedJson(req, MAX_JSON_BODY_BYTES);
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json({ error: 'request_body_too_large' }, { status: 413 });
    }
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  if (!isPlainObject(parsed)) {
    return NextResponse.json({ error: 'bad_json' }, { status: 400 });
  }
  const b = parsed;

  // Reprise — ne rappelle JAMAIS le RPC d'effacement, ne fait que recharger l'opération.
  if (typeof b.operationId === 'string') {
    const operationId = b.operationId.trim();
    if (!UUID_RE.test(operationId)) {
      return NextResponse.json({ error: 'invalid_operation_id' }, { status: 400 });
    }
    const initial = await safeGetCleanupStatus(server, operationId);
    if (initial.kind === 'not_found') {
      // "Introuvable" UNIQUEMENT quand le RPC ne rapporte aucune erreur ET aucune donnée —
      // jamais confondu avec une panne de lecture (branche 'error' ci-dessous).
      return NextResponse.json({ error: 'operation_not_found' }, { status: 404 });
    }
    if (initial.kind === 'error') {
      // Panne contrôlée : jamais le message brut upstream, jamais une exception non attrapée.
      return NextResponse.json({ error: 'operation_lookup_failed' }, { status: 500 });
    }
    await processTasks(server, auth.asCaller, auth.callerId, initial.status);
    const refreshed = await safeGetCleanupStatus(server, operationId);
    if (refreshed.kind !== 'ok') {
      // Le traitement a peut-être réussi, mais on ne peut pas le CONFIRMER : jamais présenté
      // comme un succès figé sur l'instantané pré-traitement — on le retient tel quel (rapport/
      // operationId connus), marqué non confirmé.
      return buildStatusResponse(initial.status, true);
    }
    return buildStatusResponse(refreshed.status);
  }

  // Démarrage — contrat d'entrée inchangé.
  const subjectKind = b.subjectKind;
  const subjectId = b.subjectId;
  const mode = (b.mode as string | undefined) ?? 'anonymize';
  const reason = typeof b.reason === 'string' ? b.reason : null;

  if (typeof subjectKind !== 'string' || !SUBJECT_KINDS.includes(subjectKind as SubjectKind)) {
    return NextResponse.json({ error: 'invalid_subject_kind' }, { status: 400 });
  }
  if (typeof subjectId !== 'string' || !UUID_RE.test(subjectId.trim())) {
    return NextResponse.json({ error: 'invalid_subject_id' }, { status: 400 });
  }
  if (!MODES.includes(mode as Mode)) {
    return NextResponse.json({ error: 'invalid_mode' }, { status: 400 });
  }

  // Check before the destructive RPC: the previous SQL version could otherwise
  // commit an erasure and only then fail our operationId check, without cleanup.
  if (!(await hasDurableCleanupCapability(server))) {
    return NextResponse.json({ error: 'setup_incomplete' }, { status: 503 });
  }

  const { data: rpcData, error: rpcErr } = await auth.asCaller.schema('api').rpc('rpc_gdpr_erase_subject', {
    p_subject_kind: subjectKind,
    p_subject_id: subjectId.trim(),
    p_mode: mode,
    p_reason: reason,
  });
  if (rpcErr) {
    const msg = rpcErr.message ?? 'erase_failed';
    const forbidden = /administrateurs plateforme|permission|not allowed|denied|owner|super administrateur|auto-effacement/i.test(
      msg,
    );
    return NextResponse.json({ error: 'erase_failed', detail: msg }, { status: forbidden ? 403 : 400 });
  }

  const report = (rpcData ?? {}) as Record<string, unknown>;
  const operationId = typeof report.operationId === 'string' ? report.operationId : null;
  if (!operationId) {
    // Pas de fallback silencieux vers un succès non durable : si la migration n'est pas à jour,
    // le RPC ne retourne pas d'operationId — l'échec doit être explicite et actionnable.
    return NextResponse.json(
      {
        error: 'setup_incomplete',
        detail: "operationId manquant dans la réponse RPC : migration gdpr_cleanup_operations absente ou non à jour.",
      },
      { status: 500 },
    );
  }

  // L'effacement SQL est déjà commis à partir d'ici (operationId connu) : PLUS AUCUN chemin ne
  // doit rappeler rpc_gdpr_erase_subject, ni perdre operationId, ni laisser passer une exception.
  const initial = await safeGetCleanupStatus(server, operationId);
  if (initial.kind !== 'ok') {
    return buildStatusResponse(
      { operationId, subjectKind, subjectId, mode, reason, performedBy: null, performedAt: '', report, tasks: [] },
      true,
    );
  }
  await processTasks(server, auth.asCaller, auth.callerId, initial.status);
  const refreshed = await safeGetCleanupStatus(server, operationId);
  if (refreshed.kind !== 'ok') {
    return buildStatusResponse(initial.status, true);
  }
  return buildStatusResponse(refreshed.status);
}
