import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { acquireLease, BodyTooLargeError, readBoundedJson, SEMAPHORE_RETRY_AFTER_SECONDS } from '@/lib/request-body.server';
import { MAX_TRANSLATION_BODY_BYTES, translateFields, TranslationError, translationRequestSchema, type TranslationRequest } from './translation';

export const runtime = 'nodejs';
export const maxDuration = 60;

// As with menu extraction, this is a per-instance throttle; the shared AI lease also caps concurrency.
const recentHits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  for (const [id, hits] of recentHits) {
    if ((hits.at(-1) ?? 0) <= now - 60_000) recentHits.delete(id);
  }
  const hits = (recentHits.get(userId) ?? []).filter((at) => at > now - 60_000);
  if (hits.length >= 12) return true;
  recentHits.set(userId, [...hits, now]);
  return false;
}

function errorResponse(error: string, detail: string, status: number): NextResponse {
  return NextResponse.json({ error, detail }, { status });
}

/** Produces a draft only. Existing editor saves and actor submissions retain their own write gates. */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const jwt = /^Bearer\s+(.+)$/i.exec(req.headers.get('authorization') ?? '')?.[1]?.trim();
  if (!jwt) return errorResponse('unauthenticated', 'Reconnectez-vous pour utiliser la traduction IA.', 401);

  const server = getServerSupabaseClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!server || !url || !anon) return errorResponse('server_misconfigured', 'Le service de traduction IA est indisponible.', 503);

  try {
    const { data, error } = await server.auth.getUser(jwt);
    if (error || !data?.user) return errorResponse('unauthenticated', 'Reconnectez-vous pour utiliser la traduction IA.', 401);
    if (rateLimited(data.user.id)) {
      return NextResponse.json({ error: 'rate_limited', detail: 'Trop de traductions demandées. Réessayez dans une minute.' },
        { status: 429, headers: { 'Retry-After': '60' } });
    }

    const lease = acquireLease('ai');
    if (!lease) {
      return NextResponse.json({ error: 'too_many_requests', detail: 'Une opération IA est en cours. Réessayez dans un instant.' },
        { status: 429, headers: { 'Retry-After': String(SEMAPHORE_RETRY_AFTER_SECONDS) } });
    }
    try {
      let body: TranslationRequest;
      try {
        body = translationRequestSchema.parse(await readBoundedJson(req, MAX_TRANSLATION_BODY_BYTES));
      } catch (error) {
        return error instanceof BodyTooLargeError
          ? errorResponse('request_body_too_large', 'Le texte est trop volumineux pour une seule traduction.', 413)
          : errorResponse('bad_request', 'Vérifiez les langues et les textes à traduire (30 000 caractères maximum).', 400);
      }

      const caller = createClient(url, anon, {
        global: { headers: { Authorization: `Bearer ${jwt}` } },
        auth: { persistSession: false, autoRefreshToken: false },
      }).schema('api');
      const canonical = await caller.rpc('user_can_write_object_canonical', { p_object_id: body.objectId });
      if (canonical.error) return errorResponse('forbidden', 'Vous ne pouvez pas traduire cette fiche.', 403);
      let allowed = canonical.data === true;
      if (!allowed) {
        const enrichment = await caller.rpc('user_can_write_enrichment', { p_object_id: body.objectId });
        if (enrichment.error) return errorResponse('forbidden', 'Vous ne pouvez pas traduire cette fiche.', 403);
        allowed = enrichment.data === true;
      }
      if (!allowed) {
        // This RPC enforces actor persona, explicit actor link, link validity and test realm.
        const portal = await caller.rpc('list_my_portal_fiches', {});
        allowed = !portal.error && Array.isArray(portal.data)
          && portal.data.some((fiche: unknown) => typeof fiche === 'object' && fiche !== null
            && 'id' in fiche && fiche.id === body.objectId);
      }
      if (!allowed) return errorResponse('forbidden', 'Vous ne pouvez pas traduire cette fiche.', 403);

      const controller = new AbortController();
      const abortFromCaller = () => controller.abort();
      req.signal.addEventListener('abort', abortFromCaller, { once: true });
      if (req.signal.aborted) controller.abort();
      const timeout = setTimeout(() => controller.abort(), 45_000);
      try {
        // Only the service-role client reads the Vault key, after caller-scoped authorization.
        const provider = await resolveActiveAiProvider(server, controller.signal);
        if (!provider) return errorResponse('not_configured', 'Aucun fournisseur IA compatible actif. Contactez votre administrateur.', 503);
        const translations = await translateFields(body, {
          apiKind: provider.config.apiKind,
          baseUrl: provider.config.baseUrl,
          model: provider.config.model,
          maxOutputTokens: provider.config.maxOutputTokens,
          extra: provider.config.extra,
        }, provider.apiKey, { signal: controller.signal });
        return NextResponse.json({ translations }, { headers: { 'Cache-Control': 'no-store' } });
      } catch (error) {
        if (controller.signal.aborted) return errorResponse('translation_timeout', 'La traduction prend trop de temps. Réessayez.', 504);
        if (error instanceof TranslationError) {
          const status = error.code === 'unsupported_provider' ? 503 : 502;
          return errorResponse(error.code, error.message, status);
        }
        return errorResponse('translation_failed', 'La traduction a échoué. Réessayez dans un instant.', 502);
      } finally {
        clearTimeout(timeout);
        req.signal.removeEventListener('abort', abortFromCaller);
      }
    } finally {
      lease.release();
    }
  } catch {
    return errorResponse('translation_failed', 'La traduction a échoué. Réessayez dans un instant.', 502);
  }
}
