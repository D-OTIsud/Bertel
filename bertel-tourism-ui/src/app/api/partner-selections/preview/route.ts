import { NextRequest, NextResponse } from 'next/server';
import { createCallerClient } from '@/lib/supabase-caller.server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { callPublicRpc } from '@/lib/public-api';
import { type PartnerSelection, selectionDefinitionHash } from '@/lib/partner-selections';

export const runtime = 'nodejs';
const MAX_BODY_LENGTH = 128 * 1024;
const json = (body: unknown, status = 200) => NextResponse.json(body, {
  status, headers: { 'Cache-Control': 'no-store' },
});

/** Preview the public feed after the caller-scoped organisation-admin gate. */
export async function POST(req: NextRequest) {
  const authorization = req.headers.get('authorization') ?? '';
  const jwt = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
  if (!jwt) return json({ error: 'unauthenticated' }, 401);
  const server = getServerSupabaseClient();
  if (!server) return json({ error: 'server_unavailable' }, 503);
  const { data: identity, error: identityError } = await server.auth.getUser(jwt);
  if (identityError || !identity.user) return json({ error: 'unauthenticated' }, 401);

  const raw = await req.text();
  if (raw.length > MAX_BODY_LENGTH) return json({ error: 'body_too_large' }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return json({ error: 'bad_request' }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (!Array.isArray(body.buckets)
    || Object.keys(body).some((key) => !['buckets','orgObjectId','communeInsee','name','cursor','pageSize'].includes(key))
    || (body.pageSize !== undefined && (typeof body.pageSize !== 'number'
      || !Number.isSafeInteger(body.pageSize) || body.pageSize < 1 || body.pageSize > 25))
    || (body.orgObjectId != null && typeof body.orgObjectId !== 'string')
    || (body.name != null && typeof body.name !== 'string')
    || (body.communeInsee != null && (!Array.isArray(body.communeInsee)
      || !body.communeInsee.every((code) => typeof code === 'string')))
    || (body.cursor != null && (typeof body.cursor !== 'string' || body.cursor.length > 16000))) {
    return json({ error: 'bad_request' }, 400);
  }
  const caller = createCallerClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim(),
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim(), jwt,
  );
  // The service-role client must never evaluate the user's permission gate.
  const { data: prepared, error: gateError } = await caller.schema('api').rpc('prepare_partner_selection_preview', {
    p_buckets: body.buckets,
    p_org_object_id: body.orgObjectId ?? null,
    p_commune_insee: body.communeInsee ?? null,
    p_name: typeof body.name === 'string' && body.name.trim() ? body.name : 'Aperçu',
  });
  if (gateError) {
    if (gateError.code === '42501' || gateError.code === 'PT403') return json({ error: 'forbidden' }, 403);
    if (gateError.code === 'PT400' || gateError.code === '22023') return json({ error: 'bad_request' }, 400);
    return json({ error: 'preview_unavailable' }, 502);
  }
  if (!prepared || typeof prepared !== 'object' || !Array.isArray(prepared.buckets)) {
    return json({ error: 'preview_unavailable' }, 502);
  }
  const selection: PartnerSelection = {
    id: 'preview', name: String(prepared.name), revision: 1,
    buckets: prepared.buckets, communeInsee: prepared.commune_insee ?? null,
  };
  const pageSize = typeof body.pageSize === 'number' ? body.pageSize : 25;
  const result = await callPublicRpc('list_partner_selection_objects_with_vocabulary', {
    p_buckets: selection.buckets,
    p_selection_id: selection.id,
    p_definition_hash: selectionDefinitionHash(selection),
    p_partner_key_id: `admin-preview:${identity.user.id}`,
    p_cursor: body.cursor ?? null,
    p_page_size: pageSize,
    p_view: 'card',
    p_commune_insee: selection.communeInsee,
  });
  if (!result.ok) return json(result.body, result.status);
  const page = result.body as { info?: Record<string, unknown>; meta?: Record<string, unknown>; data?: unknown[] };
  const sourceMeta = page.meta ?? page.info ?? {};
  if (!Array.isArray(page.data) || typeof sourceMeta.total !== 'number') {
    return json({ error: 'preview_unavailable' }, 502);
  }
  return json({ meta: { total: sourceMeta.total, next_cursor: sourceMeta.next_cursor ?? null,
    page_size: sourceMeta.page_size ?? pageSize, preview: true }, data: page.data });
}
