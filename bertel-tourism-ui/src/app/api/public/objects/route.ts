import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';

export const runtime = 'nodejs';

/** Pivot formats servable per list item (I4/§138): one batch RPC call per page, merged as `item.<profil>`. */
const PIVOT_FORMATS = new Set(['jsonld', 'datatourisme', 'apidae', 'tourinsoft']);

/**
 * GET /api/public/objects — partner-facing paginated list of PUBLISHED objects (audit API R1b).
 * Auth: `Authorization: Bearer bk_live_…`. Status is FORCED to 'published' — a partner never sees drafts.
 * Query: cursor, page_size (1-200), types (csv of object_type), lang, search.
 *
 * Interop (I4c/§138): `?format=<profil>` (jsonld | datatourisme | apidae | tourinsoft) attaches the
 * pivot document to EACH page item under an additive `item.<profil>` key — same cursor pagination,
 * ONE batch RPC per page (`get_objects_interop_batch`, 88 ms measured for a full 200-item page).
 * Best-effort: a batch failure degrades to the plain page; unmapped items simply lack the key.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const headers = publicHeaders();
  const partner = await authenticatePartner(req.headers.get('authorization'));
  if (!partner) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });

  const rate = await checkPartnerRate(partner.keyId);
  if (!rate.allowed) {
    await logPartnerCall(partner.keyId, 'GET /api/public/objects', 429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') ?? '50') || 50, 1), 200);
  const typesParam = url.searchParams.get('types');
  const types = typesParam ? typesParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const lang = (url.searchParams.get('lang') ?? 'fr').trim() || 'fr';
  const search = url.searchParams.get('search');
  const format = (url.searchParams.get('format') ?? '').trim().toLowerCase();

  const result = await callPublicRpc('list_object_resources_page_text', {
    p_cursor: cursor,
    p_lang_prefs: [lang],
    p_page_size: pageSize,
    p_types: types, // text[] — invalid codes simply match nothing
    p_status: ['published'], // FORCED — partners see published only
    p_search: search,
    p_track_format: 'none',
  });

  await logPartnerCall(partner.keyId, 'GET /api/public/objects', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  // The RPC returns its own { info|meta, data }. Re-wrap under the public contract envelope.
  const rpcBody = (result.body ?? {}) as { info?: Record<string, unknown>; meta?: Record<string, unknown>; data?: unknown };
  const pageInfo = rpcBody.info ?? rpcBody.meta ?? {};
  let items = Array.isArray(rpcBody.data) ? (rpcBody.data as Record<string, unknown>[]) : [];

  if (PIVOT_FORMATS.has(format) && items.length > 0) {
    // One batch call for the whole page; merge each pivot document under item.<profil> (additive,
    // mirror of the detail route). Best-effort — a failure leaves the plain page untouched.
    const ids = items.map((it) => it?.id).filter((v): v is string => typeof v === 'string');
    const batch = await callPublicRpc('get_objects_interop_batch', { p_object_ids: ids, p_profile: format });
    if (batch.ok && batch.body && typeof batch.body === 'object') {
      const docs = batch.body as Record<string, unknown>;
      items = items.map((it) =>
        typeof it?.id === 'string' && docs[it.id as string] != null ? { ...it, [format]: docs[it.id as string] } : it,
      );
    }
  }

  return NextResponse.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION, ...pageInfo }, data: Array.isArray(rpcBody.data) ? items : rpcBody.data ?? [] },
    { status: 200, headers },
  );
}
