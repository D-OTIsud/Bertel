import { partnerRequestMetrics } from '@/lib/partner-request-metrics';
import { type NextResponse, type NextRequest } from 'next/server';
import { admitPartner } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { resolveTourinsoftVariant } from '@/lib/tourinsoft-export';

export const runtime = 'nodejs';

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape

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
  const metrics = partnerRequestMetrics('detail');
  const headers = publicHeaders();
  const admission = await metrics.measure('admission', () => admitPartner(req.headers.get('authorization')));
  if (!admission) return metrics.json({ error: 'unauthorized' }, { status: 401, headers });

  const { partner, rate } = admission;
  // Rate-limit headers on every subsequent response (partners self-throttle). remaining=0 on a 429.
  headers['X-RateLimit-Limit'] = String(rate.limit);
  headers['X-RateLimit-Remaining'] = String(rate.remaining);
  if (!rate.allowed) {
    metrics.audit(partner.keyId, 'GET /api/public/objects/{id}', 429);
    return metrics.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const { id } = await ctx.params;
  if (!OBJECT_ID_SHAPE.test(id)) {
    metrics.audit(partner.keyId, 'GET /api/public/objects/{id}', 400);
    return metrics.json({ error: 'invalid_object_id' }, { status: 400, headers });
  }

  const url = new URL(req.url);
  const lang = (url.searchParams.get('lang') ?? 'fr').trim() || 'fr';
  const wantAllLangs = lang.toLowerCase() === 'all';
  // `all` is not a language: resolve the base keys in FR and add the multi-language block below.
  const baseLang = wantAllLangs ? 'fr' : lang;
  const format = (url.searchParams.get('format') ?? '').trim().toLowerCase();
  const tourinsoftVariant = resolveTourinsoftVariant(format, url.searchParams.get('variant'));
  if (!tourinsoftVariant.ok) {
    metrics.audit(partner.keyId, 'GET /api/public/objects/{id}', 400);
    return metrics.json({ error: 'bad_request', detail: tourinsoftVariant.detail }, { status: 400, headers });
  }

  // Published gate — the security boundary for the single-object read (service-role bypasses RLS).
  const server = getServerSupabaseClient();
  if (!server) return metrics.json({ error: 'server_misconfigured' }, { status: 500, headers });
  const { data: statusRow, error: statusErr } = await metrics.measure('published_gate', async () => server
    .from('object').select('status').eq('id', id).maybeSingle());
  if (statusErr || !statusRow || statusRow.status !== 'published') {
    metrics.audit(partner.keyId, 'GET /api/public/objects/{id}', 404);
    return metrics.json({ error: 'not_found' }, { status: 404, headers });
  }

  const result = await metrics.measure('detail_rpc', () => callPublicRpc('get_partner_object_with_vocabulary', {
    p_object_id: id,
    p_lang_prefs: [baseLang],
    p_format: format,
    p_variant: tourinsoftVariant.variant,
    p_i18n_all: wantAllLangs,
  }));
  metrics.audit(partner.keyId, 'GET /api/public/objects/{id}', result.status);
  if (!result.ok) return metrics.json(result.body, { status: result.status, headers });

  // The RPC repeats the published/real gate in the same snapshot as the content.
  // An object unpublished after the preliminary gate therefore cannot leak.
  if (result.body == null) return metrics.json({ error: 'not_found' }, { status: 404, headers });
  const snapshot = result.body as { meta?: Record<string, unknown>; data?: unknown };
  const body = Object.prototype.hasOwnProperty.call(snapshot, 'data') ? snapshot.data : result.body;
  if (body == null) return metrics.json({ error: 'not_found' }, { status: 404, headers });

  // Shallow copy so we can trim/augment without mutating the RPC result in place.
  const data: Record<string, unknown> | unknown =
    body && typeof body === 'object' ? { ...(body as Record<string, unknown>) } : body;

  if (data && typeof data === 'object') {
    // Editor-only raw *_i18n legs — never exposed on the partner (third-party) path (§106/§112).
    delete (data as Record<string, unknown>).canonical_description;
    delete (data as Record<string, unknown>).org_description;

    // Optional i18n and pivot blocks are already attached inside the same SQL snapshot.
  }

  return metrics.json(
    { meta: { contract_version: PUBLIC_API_CONTRACT_VERSION,
      ...(snapshot.meta?.vocabulary_release != null ? { vocabulary_release: snapshot.meta.vocabulary_release } : {}),
    }, data },
    { status: 200, headers },
  );
}
