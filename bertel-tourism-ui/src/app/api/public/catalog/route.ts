import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';

export const runtime = 'nodejs';

/**
 * GET /api/public/catalog — partner-facing controlled-vocabulary catalogs (audit API R1b + I1).
 * Auth: `Authorization: Bearer bk_live_…`.
 * Query: `domains` (csv of public domains) → that subset; none → ALL public catalogs.
 * Response `data` = `{ <domain>: [{code,name,icon_url,parent_code,domain}] }`. Unknown domains
 * are silently ignored (list_reference_bundle filters against the whitelist). The keys of the
 * full bundle are the discoverable domain list.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const headers = publicHeaders();
  const partner = await authenticatePartner(req.headers.get('authorization'));
  if (!partner) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });

  const rate = await checkPartnerRate(partner.keyId);
  // Rate-limit headers on every subsequent response (partners self-throttle). remaining=0 on a 429.
  headers['X-RateLimit-Limit'] = String(rate.limit);
  headers['X-RateLimit-Remaining'] = String(rate.remaining);
  if (!rate.allowed) {
    await logPartnerCall(partner.keyId, 'GET /api/public/catalog', 429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const url = new URL(req.url);
  const domainsParam = url.searchParams.get('domains');
  const domains = domainsParam ? domainsParam.split(',').map((s) => s.trim()).filter(Boolean) : null;
  const lang = (url.searchParams.get('lang') ?? 'fr').trim() || 'fr';

  const result = await callPublicRpc('list_reference_bundle', { p_domains: domains, p_lang: lang });
  await logPartnerCall(partner.keyId, 'GET /api/public/catalog', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  return NextResponse.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION }, data: result.body ?? {} },
    { status: 200, headers },
  );
}
