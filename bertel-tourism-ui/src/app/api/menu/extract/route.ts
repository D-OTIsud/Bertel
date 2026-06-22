import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { MediaProcessingError } from '../../media/upload/process-image';
import { prepareVisionImage, MAX_VISION_IMAGES } from './media-prep';
import { orchestrateExtraction } from './orchestrate';
import type { ProviderConfig } from './provider';

export const runtime = 'nodejs'; // sharp + provider call
export const maxDuration = 60;

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const refOption = z.object({ id: z.string(), code: z.string(), label: z.string() });
const requestSchema = z.object({
  object_id: z.string(),
  menu_title: z.string().optional().default(''),
  lang: z.string().optional(),
  images: z.array(z.object({ mime: z.string(), base64: z.string().min(1) })).min(1),
  allowed_sections: z.array(refOption).default([]),
  allowed_dietary: z.array(refOption).default([]),
});

// Best-effort per-user, per-instance throttle (MVP; a DB-backed limiter is a documented follow-up).
const RATE_LIMIT = 12;
const RATE_WINDOW_MS = 60_000;
const recentHits = new Map<string, number[]>();
function isRateLimited(userId: string): boolean {
  const now = Date.now();
  const arr = (recentHits.get(userId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  if (arr.length >= RATE_LIMIT) {
    recentHits.set(userId, arr);
    return true;
  }
  arr.push(now);
  recentHits.set(userId, arr);
  return false;
}

/**
 * §06 carte extraction: image bytes (carte photos / client-rasterized PDF pages) → structured draft
 * menu via the configured AI provider. Authorizes AS THE CALLER (user_can_write_object_canonical) —
 * the same boundary as media/document upload. The provider key is read service-role from Vault and
 * NEVER reaches the client. Returns a draft menu the editor reviews; no DB write here.
 * Spec: docs/superpowers/specs/2026-06-22-ai-menu-extraction-design.md §5.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: 'bad_request', detail: err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'invalid body' },
      { status: 400 },
    );
  }

  if (!OBJECT_ID_SHAPE.test(body.object_id)) {
    return NextResponse.json({ error: 'invalid_object_id' }, { status: 400 });
  }

  if (isRateLimited(userData.user.id)) {
    return NextResponse.json({ error: 'rate_limited', detail: 'trop de demandes, réessayez dans une minute' }, { status: 429 });
  }

  // Authorize AS THE CALLER — same predicate as every canonical write policy. Fail-closed.
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const asCaller = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: canWrite, error: canWriteErr } = await asCaller
    .schema('api')
    .rpc('user_can_write_object_canonical', { p_object_id: body.object_id });
  if (canWriteErr || canWrite !== true) {
    return NextResponse.json({ error: 'forbidden', detail: 'caller cannot edit this object' }, { status: 403 });
  }

  // Cap image count (cost) and re-encode each (resize + EXIF strip) before sending to the provider.
  const truncated = body.images.length > MAX_VISION_IMAGES;
  const selected = body.images.slice(0, MAX_VISION_IMAGES);
  let preparedImages;
  try {
    preparedImages = await Promise.all(
      selected.map((img) => {
        const buf = Buffer.from(img.base64, 'base64');
        if (buf.byteLength > MAX_IMAGE_BYTES) {
          throw new MediaProcessingError('size', 'image trop volumineuse');
        }
        return prepareVisionImage(buf, img.mime);
      }),
    );
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      const status = err.code === 'size' ? 413 : 415;
      return NextResponse.json({ error: err.code, detail: err.message }, { status });
    }
    return NextResponse.json({ error: 'image_prep_failed', detail: err instanceof Error ? err.message : 'unknown' }, { status: 400 });
  }

  const getActiveProvider = async (): Promise<{ config: ProviderConfig; apiKey: string | null } | null> => {
    const { data, error } = await server.schema('api').rpc('get_active_ai_provider_secret');
    if (error) throw new Error(error.message);
    const row = (Array.isArray(data) ? data[0] : data) as
      | { api_kind: ProviderConfig['apiKind']; base_url: string; model: string; max_output_tokens: number; extra: Record<string, unknown> | null; api_key: string | null }
      | undefined;
    if (!row) return null;
    return {
      config: { apiKind: row.api_kind, baseUrl: row.base_url, model: row.model, maxOutputTokens: row.max_output_tokens, extra: row.extra },
      apiKey: row.api_key ?? null,
    };
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55_000);
  try {
    const result = await orchestrateExtraction(
      {
        menuTitle: body.menu_title,
        allowedSections: body.allowed_sections,
        allowedDietary: body.allowed_dietary,
        images: preparedImages,
        lang: body.lang,
      },
      { getActiveProvider, signal: controller.signal },
    );

    if (!result.ok) {
      const status = result.code === 'not_configured' ? 503
        : result.code === 'provider_error' ? 502
        : result.code === 'unparseable' ? 422
        : 400;
      return NextResponse.json({ error: result.code, detail: result.detail }, { status });
    }

    return NextResponse.json(
      { menu: result.menu, suggestedDietaryByDish: result.suggestedDietaryByDish, truncated },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      { error: 'extraction_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  } finally {
    clearTimeout(timeout);
  }
}
