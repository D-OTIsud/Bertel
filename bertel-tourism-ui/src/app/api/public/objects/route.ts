import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';
import { OBJECT_TYPE_CODES } from '@/lib/object-types';

export const runtime = 'nodejs';

/** Pivot formats servable per list item (I4/§153): one batch RPC call per page, merged as `item.<profil>`. */
const PIVOT_FORMATS = new Set(['jsonld', 'datatourisme', 'apidae', 'tourinsoft']);

/**
 * GET /api/public/objects — partner-facing paginated list of PUBLISHED objects (audit API R1b).
 * Auth: `Authorization: Bearer bk_live_…`. Status is FORCED to 'published' — a partner never sees drafts.
 * Query: cursor, page_size (1-200), types (csv of object_type), lang, search.
 *
 * Interop (I4c/§153): `?format=<profil>` (jsonld | datatourisme | apidae | tourinsoft) attaches the
 * pivot document to EACH page item under an additive `item.<profil>` key — same cursor pagination,
 * ONE batch RPC per page (`get_objects_interop_batch`, 88 ms measured for a full 200-item page).
 * Best-effort: a batch failure degrades to the plain page; unmapped items simply lack the key.
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
    await logPartnerCall(partner.keyId, 'GET /api/public/objects', 429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const url = new URL(req.url);
  const cursor = url.searchParams.get('cursor');
  // Mode d'affichage : 'full' = fiche complète get_object_resource par item (lourd, plafond bas),
  // 'card' (défaut) = carte allégée. Toute valeur ≠ 'full' ⇒ 'card'.
  const view = (url.searchParams.get('view') ?? 'card').trim().toLowerCase() === 'full' ? 'full' : 'card';
  const isFull = view === 'full';
  // Plafond perf (§125) : full borné à 100 (mesuré ~3 s / 1,6 Mo), défaut 25 ; card inchangé 50/200.
  const defaultSize = isFull ? 25 : 50;
  const maxSize = isFull ? 100 : 200;
  const pageSize = Math.min(Math.max(Number(url.searchParams.get('page_size') ?? String(defaultSize)) || defaultSize, 1), maxSize);
  // `types` — optional CSV of object_type codes. Normalize case (the enum is upper-case) and reject
  // any unknown code at the boundary (fail-fast) instead of letting the RPC cast it to the enum: an
  // invalid value raises Postgres 22P02 and would surface as a misleading 502 (audit CRITICAL
  // 2026-07-03). Absent ⇒ null (no type filter).
  const typesParam = url.searchParams.get('types');
  let types: string[] | null = null;
  if (typesParam) {
    types = typesParam.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean);
    const unknown = types.filter((code) => !OBJECT_TYPE_CODES.has(code));
    if (unknown.length > 0) {
      return NextResponse.json(
        { error: 'bad_request', detail: `unknown object type code(s): ${unknown.join(', ')}` },
        { status: 400, headers },
      );
    }
  }
  const lang = (url.searchParams.get('lang') ?? 'fr').trim() || 'fr';
  const search = url.searchParams.get('search');
  const format = (url.searchParams.get('format') ?? '').trim().toLowerCase();
  // Blob GPX/KML des itinéraires — honoré uniquement en mode full (les cartes ne portent pas
  // itinerary_details). Le tracé GeoJSON est de toute façon natif (track_geojson).
  const trackParam = (url.searchParams.get('track') ?? '').trim().toLowerCase();
  const track = isFull && (trackParam === 'gpx' || trackParam === 'kml') ? trackParam : 'none';

  const result = await callPublicRpc('list_object_resources_page_text', {
    p_cursor: cursor,
    p_lang_prefs: [lang],
    p_page_size: pageSize,
    p_types: types, // text[] — pre-validated upper-case object_type codes (unknown ⇒ 400 above)
    p_status: ['published'], // FORCED — partners see published only
    p_search: search,
    p_track_format: track,
    p_view: view, // 'full' ⇒ fiche complète par item ; 'card' (défaut) ⇒ carte allégée
  });

  await logPartnerCall(partner.keyId, 'GET /api/public/objects', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  // The RPC returns its own { info|meta, data }. Re-wrap under the public contract envelope.
  const rpcBody = (result.body ?? {}) as { info?: Record<string, unknown>; meta?: Record<string, unknown>; data?: unknown };
  const pageInfo = rpcBody.info ?? rpcBody.meta ?? {};
  let items = Array.isArray(rpcBody.data) ? (rpcBody.data as Record<string, unknown>[]) : [];

  if (isFull) {
    // Mode full : chaque item est la fiche complète get_object_resource — retirer les 2 legs
    // éditeur (Markdown i18n brut), exactement comme la route détail /objects/{id} (§106/§112).
    items = items.map((it) => {
      if (!it || typeof it !== 'object') return it;
      const copy = { ...it };
      delete copy.canonical_description;
      delete copy.org_description;
      return copy;
    });
  }

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

  // Meta = white-list explicite : SEULES les 4 clés publiques contractuelles sortent ; les clés
  // internes du RPC (kind, offset, schema_version, render_*, cursor, language*, …) sont écartées.
  const data = Array.isArray(rpcBody.data) ? items : rpcBody.data ?? [];
  const total = pageInfo.total;
  const offset = pageInfo.offset;
  // Correctif next_cursor : le RPC émet un curseur non-null même sur une dernière page pile pleine
  // (il pointerait vers une page vide). Si l'offset+count couvre déjà le total, on force null.
  const count = Array.isArray(data) ? data.length : 0;
  const nextCursor =
    typeof total === 'number' && typeof offset === 'number' && offset + count >= total
      ? null
      : pageInfo.next_cursor ?? null;

  return NextResponse.json(
    {
      meta: {
        contract_version: PUBLIC_API_CONTRACT_VERSION,
        page_size: pageInfo.page_size ?? pageSize,
        total,
        next_cursor: nextCursor,
      },
      data,
    },
    { status: 200, headers },
  );
}
