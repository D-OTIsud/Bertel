export const CARTE_REQUEST_REPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface PendingCarteRequest {
  version: 2;
  request: Record<string, unknown> & { request_id: string };
  createdAt: string;
  baselineReadId: string | null;
}
export interface CarteSaveRequestOptions<T> {
  baselineReadId?: string;
  /** Read-only receipt lookup. A stale or undated request must never be written implicitly. */
  resolve?: (requestId: string) => Promise<T | null>;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const RELOAD = 'Rechargez la fiche pour vérifier les cartes avant un nouvel enregistrement ; votre saisie est conservée.';
const STORAGE_ERROR = 'Impossible de conserver la demande de carte sur cet appareil. Votre saisie est conservée ; libérez le stockage avant de réessayer.';

function isPending(value: unknown): value is PendingCarteRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Partial<PendingCarteRequest>;
  return row.version === 2 && Boolean(row.request) && typeof row.request === 'object'
    && !Array.isArray(row.request) && row.request?.write_contract === 'restaurant-carte-v1'
    && typeof row.request?.request_id === 'string' && UUID.test(row.request.request_id)
    && typeof row.createdAt === 'string';
}
function intentOf(request: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(request).filter(([key]) => key !== 'request_id')));
}
function uncertainFailure(error: unknown): boolean {
  const status = error && typeof error === 'object' && 'status' in error ? error.status : null;
  // The route uses 503 for uncertain copy/finalization outcomes, never a 4xx.
  return ![400, 401, 403, 404, 409, 413, 415, 422].includes(Number(status));
}

/** One UUID per intention, retained with its exact dated request until confirmation. */
export async function withPendingCarteRequest<T>(
  userId: string | undefined | null,
  objectId: string,
  payload: Record<string, unknown>,
  send: (value: Record<string, unknown>) => Promise<T>,
  confirm: (value: T) => void,
  options: CarteSaveRequestOptions<T> = {},
): Promise<T> {
  const fresh = (): PendingCarteRequest => ({
    version: 2,
    request: { ...payload, request_id: crypto.randomUUID() },
    createdAt: new Date().toISOString(),
    baselineReadId: options.baselineReadId ?? null,
  });
  if (!userId || typeof window === 'undefined') {
    const result = await send(fresh().request);
    confirm(result);
    return result;
  }
  const key = `workspace-carte-request:${userId}:${objectId}`;
  const barrierKey = `${key}:reload`;
  let raw: string | null;
  let value: unknown;
  try {
    const barrier = window.localStorage.getItem(barrierKey);
    if (barrier && (!options.baselineReadId || barrier === options.baselineReadId)) throw Object.assign(new Error(RELOAD), { reload: true });
    if (barrier && window.localStorage.getItem(barrierKey) === barrier) window.localStorage.removeItem(barrierKey);
    raw = window.localStorage.getItem(key);
    try { value = raw ? JSON.parse(raw) : null; } catch { value = null; }
  } catch (error) {
    if (error && typeof error === 'object' && 'reload' in error) throw error;
    throw new Error(STORAGE_ERROR);
  }

  const age = isPending(value) ? Date.now() - Date.parse(value.createdAt) : NaN;
  if (raw && (!isPending(value) || !Number.isFinite(age) || age < -5 * 60 * 1000 || age > CARTE_REQUEST_REPLAY_MAX_AGE_MS)) {
    let resolved: T | null = null;
    if (isPending(value) && options.resolve) {
      resolved = await options.resolve(value.request.request_id);
      if (resolved !== null) confirm(resolved);
    }
    // Keep an archive of the exact unresolved request. Require a genuinely new loader read
    // before a later save can create another intention; a repeated click does not bypass it.
    try {
      const archiveId = isPending(value) ? value.request.request_id : crypto.randomUUID();
      window.localStorage.setItem(`${key}:unresolved:${archiveId}`, JSON.stringify({ raw, resolved: resolved !== null, checkedAt: new Date().toISOString() }));
      window.localStorage.setItem(barrierKey, options.baselineReadId ?? 'missing-baseline');
      if (window.localStorage.getItem(key) === raw) window.localStorage.removeItem(key);
    } catch { throw new Error(STORAGE_ERROR); }
    throw new Error(`${resolved !== null ? 'Le précédent enregistrement a été confirmé.' : 'Cette ancienne demande n’a pas été rejouée ; son état doit être vérifié.'} ${RELOAD}`);
  }

  const pending = isPending(value) ? value : fresh();
  const serialized = JSON.stringify(pending);
  if (!raw) {
    try { window.localStorage.setItem(key, serialized); } catch { throw new Error(STORAGE_ERROR); }
  }
  // A second tab may confirm this request and persist a newer one while this tab waits.
  const removeConfirmedRequest = () => {
    if (window.localStorage.getItem(key) === serialized) window.localStorage.removeItem(key);
  };
  try {
    const result = await send(pending.request);
    confirm(result);
    removeConfirmedRequest();
    if (intentOf(pending.request) !== intentOf(payload)) {
      throw new Error(`Le dernier enregistrement des cartes est confirmé. ${RELOAD}`);
    }
    return result;
  } catch (error) {
    // Every definitive server refusal is a rolled-back transaction. Keeping it would
    // strand a corrected input behind the earlier invalid payload (e.g. 22003 or 23505).
    if (!uncertainFailure(error)) removeConfirmedRequest();
    throw error;
  }
}
