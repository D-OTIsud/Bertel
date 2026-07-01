import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';
import { getServerSupabaseClient } from '@/lib/supabase-server';

export const runtime = 'nodejs';

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape

/** Sector-interop profiles served by api.get_object_interop (I4b); 'jsonld' has its own RPC. */
const INTEROP_FORMATS = new Set(['datatourisme', 'apidae', 'tourinsoft']);

/**
 * GET /api/public/objects/{id} — partner-facing single PUBLISHED object resource (audit API R1b).
 *
 * SECURITY: the public routes call RPCs SERVICE-ROLE, which BYPASSES RLS. `get_object_resource`
 * has no status filter (the editor needs drafts), so calling it directly would leak drafts to a
 * partner. We therefore gate on `object.status = 'published'` FIRST and 404 otherwise — a partner
 * can only ever read published objects, and an unpublished/unknown id is indistinguishable (404).
 *
 * i18n (C-5): `?lang=all` resolves the base keys in FR and appends an additive top-level `i18n`
 * block ({field:{lang:plain text}}, service-role RPC `get_object_i18n_all`) so a partner gets every
 * translation in ONE call. `?lang=<code>` keeps the single-language resolution. Either way, the two
 * editor-only raw-i18n legs (`canonical_description`/`org_description`) are trimmed — a third-party
 * path never carries raw *_i18n Markdown maps (§106/§112).
 *
 * Interop (I4): `?format=<profile>` appends an additive top-level block named after the profile:
 * `jsonld` (schema.org, RPC `get_object_jsonld`), `datatourisme` / `apidae` / `tourinsoft`
 * (RPC `get_object_interop`). @type/class comes from the table-driven `ref_interop_crosswalk`.
 * Orthogonal to `?lang` and additive — the base keys are never mutated (garde §103). Best-effort.
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
  const wantAllLangs = lang.toLowerCase() === 'all';
  // `all` is not a language: resolve the base keys in FR and add the multi-language block below.
  const baseLang = wantAllLangs ? 'fr' : lang;
  const format = (url.searchParams.get('format') ?? '').trim().toLowerCase();

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
    p_lang_prefs: [baseLang],
    p_track_format: 'none',
    p_options: {},
  });
  await logPartnerCall(partner.keyId, 'GET /api/public/objects/{id}', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  // Shallow copy so we can trim/augment without mutating the RPC result in place.
  const data: Record<string, unknown> | unknown =
    result.body && typeof result.body === 'object' ? { ...(result.body as Record<string, unknown>) } : result.body;

  if (data && typeof data === 'object') {
    // Editor-only raw *_i18n legs — never exposed on the partner (third-party) path (§106/§112).
    delete (data as Record<string, unknown>).canonical_description;
    delete (data as Record<string, unknown>).org_description;

    if (wantAllLangs) {
      // Additive multi-language block. Best-effort: a failure here degrades to the base (FR)
      // resource rather than failing the whole response — the object is still fully returned.
      const i18n = await callPublicRpc('get_object_i18n_all', { p_object_id: id });
      if (i18n.ok) (data as Record<string, unknown>).i18n = i18n.body ?? {};
    }

    if (format === 'jsonld') {
      // Additive schema.org JSON-LD block (I4). Best-effort: a failure degrades to the base resource.
      // Profile defaults to 'jsonld' (schema.org) in the RPC; @type comes from ref_interop_crosswalk.
      const jsonld = await callPublicRpc('get_object_jsonld', { p_object_id: id });
      if (jsonld.ok && jsonld.body != null) (data as Record<string, unknown>).jsonld = jsonld.body;
    } else if (INTEROP_FORMATS.has(format)) {
      // Additive sector-interop block (I4b): datatourisme / apidae / tourinsoft. Merged under a key
      // named after the profile (data.datatourisme, data.apidae, data.tourinsoft). Best-effort.
      const interop = await callPublicRpc('get_object_interop', { p_object_id: id, p_profile: format });
      if (interop.ok && interop.body != null) (data as Record<string, unknown>)[format] = interop.body;
    }
  }

  return NextResponse.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION }, data },
    { status: 200, headers },
  );
}
