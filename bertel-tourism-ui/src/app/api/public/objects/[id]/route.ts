import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape

/**
 * GET /api/public/objects/{id} — partner-facing single PUBLISHED object resource (audit API R1b).
 *
 * SECURITY: the public routes call RPCs SERVICE-ROLE, which BYPASSES RLS. `get_object_resource`
 * has no status filter (the editor needs drafts), so calling it directly would leak drafts to a
 * partner. We therefore gate on `object.status = 'published'` FIRST and 404 otherwise — a partner
 * can only ever read published objects, and an unpublished/unknown id is indistinguishable (404).
 */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }): Promise<NextResponse> {
  const headers = publicHeaders();
  const partner = await authenticatePartner(req.headers.get('authorization'));
  if (!partner) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });

  const rate = await checkPartnerRate(partner.keyId);
  if (!rate.allowed) {
    await logPartnerCall(partner.keyId, 'GET /api/public/objects/{id}', 429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const { id } = await ctx.params;
  if (!OBJECT_ID_SHAPE.test(id)) {
    await logPartnerCall(partner.keyId, 'GET /api/public/objects/{id}', 400);
    return NextResponse.json({ error: 'invalid_object_id' }, { status: 400, headers });
  }

  const url = new URL(req.url);
  const lang = (url.searchParams.get('lang') ?? 'fr').trim() || 'fr';

  // Published gate — the security boundary for the single-object read (service-role bypasses RLS).
  const server = getServerSupabaseClient();
  if (!server) return NextResponse.json({ error: 'server_misconfigured' }, { status: 500, headers });
  const { data: statusRow, error: statusErr } = await server
    .from('object').select('status').eq('id', id).maybeSingle();
  if (statusErr || !statusRow || statusRow.status !== 'published') {
    await logPartnerCall(partner.keyId, 'GET /api/public/objects/{id}', 404);
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers });
  }

  const result = await callPublicRpc('get_object_resource', {
    p_object_id: id,
    p_lang_prefs: [lang],
    p_track_format: 'none',
    p_options: {},
  });
  await logPartnerCall(partner.keyId, 'GET /api/public/objects/{id}', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  return NextResponse.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION }, data: result.body },
    { status: 200, headers },
  );
}
