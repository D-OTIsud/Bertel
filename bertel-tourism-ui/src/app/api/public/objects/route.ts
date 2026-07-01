import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';

export const runtime = 'nodejs';

/**
 * GET /api/public/objects — partner-facing paginated list of PUBLISHED objects (audit API R1b).
 * Auth: `Authorization: Bearer bk_live_…`. Status is FORCED to 'published' — a partner never sees drafts.
 * Query: cursor, page_size (1-200), types (csv of object_type), lang, search.
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
  return NextResponse.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION, ...pageInfo }, data: rpcBody.data ?? [] },
    { status: 200, headers },
  );
}
