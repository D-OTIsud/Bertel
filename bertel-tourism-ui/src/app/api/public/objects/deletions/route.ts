import { NextResponse, type NextRequest } from 'next/server';
import { authenticatePartner, checkPartnerRate, logPartnerCall } from '@/lib/partner-auth';
import { callPublicRpc, publicHeaders, PUBLIC_API_CONTRACT_VERSION } from '@/lib/public-api';

export const runtime = 'nodejs';

/**
 * GET /api/public/objects/deletions — partner-facing TOMBSTONE feed (audit API C-4).
 * Auth: `Authorization: Bearer bk_live_…`.
 *
 * Lets a partner sync HARD deletions (a published object that was definitively removed via
 * §108 `rpc_delete_object` disappears from `GET /api/public/objects` with no other signal).
 * Reads the immutable `object_deletion_log` service-role; projects ONLY {object_id,type,deleted_at}.
 *
 * Query: `since` (ISO 8601 — return deletions strictly after; omit for full history),
 *        `limit` (1-1000, default 500).
 * Response: `{ meta: { contract_version, cursor, count }, data: [{object_id,type,deleted_at}] }`.
 * `cursor` = pass it back as the next `since` to page forward (unchanged when the page is empty).
 *
 * NB (scope): upserts / current state come from `GET /api/public/objects` (published list); an
 * unpublish is a LOGICAL tombstone the partner reconciles (id absent from the published list AND
 * absent here ⇒ unpublished). This endpoint covers definitive deletions only. See C-4 in the plan.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const headers = publicHeaders();
  const partner = await authenticatePartner(req.headers.get('authorization'));
  if (!partner) return NextResponse.json({ error: 'unauthorized' }, { status: 401, headers });

  const rate = await checkPartnerRate(partner.keyId);
  if (!rate.allowed) {
    await logPartnerCall(partner.keyId, 'GET /api/public/objects/deletions', 429);
    return NextResponse.json({ error: 'rate_limited', retry_after: rate.retryAfter }, {
      status: 429, headers: { ...headers, 'Retry-After': String(rate.retryAfter) },
    });
  }

  const url = new URL(req.url);

  // `since` — optional ISO 8601 STRICT (date ou date-time). Le contrat annonce ISO 8601 : on rejette
  // au bord (fail-fast) tout ce qui n'est pas conforme, plutôt que d'accepter les formats laxistes de
  // `new Date` (ex. « July 3, 2026 ») et de passer une date reformatée arbitraire à la RPC.
  // Ancrée : YYYY-MM-DD suivi optionnellement de [T ]HH:MM (secondes/fraction/offset optionnels).
  // Absent/vide ⇒ null (historique complet, borné par limit).
  const ISO_8601 = /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
  const sinceParam = url.searchParams.get('since');
  let since: string | null = null;
  if (sinceParam !== null && sinceParam.trim() !== '') {
    const parsed = new Date(sinceParam);
    if (!ISO_8601.test(sinceParam.trim()) || Number.isNaN(parsed.getTime())) {
      return NextResponse.json(
        { error: 'bad_request', detail: 'since must be an ISO 8601 timestamp' },
        { status: 400, headers },
      );
    }
    since = parsed.toISOString();
  }

  const limit = Math.min(Math.max(Number(url.searchParams.get('limit') ?? '500') || 500, 1), 1000);

  const result = await callPublicRpc('list_deleted_objects_since', { p_since: since, p_limit: limit });
  await logPartnerCall(partner.keyId, 'GET /api/public/objects/deletions', result.status);
  if (!result.ok) return NextResponse.json(result.body, { status: result.status, headers });

  // RPC returns { tombstones, cursor, count }. Re-wrap under the public envelope: data = the array.
  const rpcBody = (result.body ?? {}) as { tombstones?: unknown; cursor?: unknown; count?: unknown };
  return NextResponse.json(
    {
      meta: { contract_version: PUBLIC_API_CONTRACT_VERSION, cursor: rpcBody.cursor ?? null, count: rpcBody.count ?? 0 },
      data: rpcBody.tombstones ?? [],
    },
    { status: 200, headers },
  );
}
