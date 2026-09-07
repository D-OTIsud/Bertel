import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { resolveActiveAiProvider } from '@/lib/ai-provider.server';
import { MediaProcessingError } from '../../media/upload/process-image';
import { prepareVisionImage, MAX_VISION_IMAGES } from './media-prep';
import { orchestrateExtraction } from './orchestrate';
import {
  readBoundedJson,
  BodyTooLargeError,
  acquireLease,
  SEMAPHORE_RETRY_AFTER_SECONDS,
} from '@/lib/request-body.server';

export const runtime = 'nodejs'; // sharp + provider call
export const maxDuration = 60;

const OBJECT_ID_SHAPE = /^[A-Z]{3}[A-Z0-9]{3}[0-9A-Z]{10}$/; // mirrors chk_object_id_shape
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;
// Base64 inflates bytes by 4/3 (rounded up to 4-char groups) — this is the longest base64
// STRING a single accepted image can legitimately be, checked BEFORE Buffer.from decodes it.
const MAX_IMAGE_BASE64_CHARS = Math.ceil(MAX_IMAGE_BYTES / 3) * 4;
// Generous but finite allowance for the non-image JSON around the images (title, lang, the
// allowed_sections/allowed_dietary option lists) — not attacker-scalable with image count.
const MAX_METADATA_BYTES = 256 * 1024;
// Whole-body ceiling: the current MAX_VISION_IMAGES (8) contract at their largest legitimate
// base64 size, plus the metadata allowance. Images beyond MAX_VISION_IMAGES are still allowed
// in the array (the route slices and reports `truncated`, unchanged contract) but are bounded
// in count so the array itself cannot be used to inflate the body past this ceiling with
// same-sized decoy entries.
const MAX_JSON_BODY_BYTES = MAX_VISION_IMAGES * MAX_IMAGE_BASE64_CHARS + MAX_METADATA_BYTES;
// COMPATIBILITY DECISION: before this change the `images` array had no length cap at all — any
// count above MAX_VISION_IMAGES (8) was silently accepted and truncated. A real caller never
// sends more than a handful of carte photos, so this cap only closes off the pathological case
// (hundreds/thousands of decoy entries) while leaving the existing >8 → truncate behaviour fully
// reachable for every realistic input: counts from 1 to MAX_IMAGES_IN_REQUEST (64) still hit the
// `truncated`/slice-to-8 branch below unchanged; only counts beyond 64 now 400 instead of
// silently truncating. Defense-in-depth ahead of the byte bound: it also bounds validation/JSON
// cost from a pathological array of many tiny entries within that byte ceiling.
const MAX_IMAGES_IN_REQUEST = MAX_VISION_IMAGES * 8;

// allowed_sections/allowed_dietary are admin-curated ref_code lists (menu sections, dietary
// tags) — a real caller sends at most a few dozen short codes/labels. Generous but finite so a
// caller can never inflate the JSON body via these fields instead of the images.
const MAX_REF_OPTIONS = 200;
const MAX_REF_OPTION_FIELD_CHARS = 200;
const refOptionField = z.string().max(MAX_REF_OPTION_FIELD_CHARS);
const refOption = z.object({ id: refOptionField, code: refOptionField, label: refOptionField });
const requestSchema = z.object({
  object_id: z.string(),
  menu_title: z.string().optional().default(''),
  lang: z.string().optional(),
  images: z
    .array(z.object({ mime: z.string(), base64: z.string().min(1).max(MAX_IMAGE_BASE64_CHARS) }))
    .min(1)
    .max(MAX_IMAGES_IN_REQUEST),
  allowed_sections: z.array(refOption).max(MAX_REF_OPTIONS).default([]),
  allowed_dietary: z.array(refOption).max(MAX_REF_OPTIONS).default([]),
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
      { error: 'server_misconfigured' } /* cause serveur : SUPABASE_SERVICE_ROLE_KEY missing */,
      { status: 500 },
    );
  }

  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

  // AI extraction is the single most expensive request kind (sharp decode/encode × up to 8
  // images + a provider round-trip) — group 'ai' caps concurrency at 1 per process (see
  // request-body.server.ts for the scaling caveat). Acquired AFTER auth, BEFORE the body read.
  const lease = acquireLease('ai');
  if (!lease) {
    return NextResponse.json(
      { error: 'too_many_requests', detail: 'Trop d’extractions en cours, réessayez dans un instant.' },
      { status: 429, headers: { 'Retry-After': String(SEMAPHORE_RETRY_AFTER_SECONDS) } },
    );
  }
  try {
    return await handlePostAuthenticated(req, server, jwt, userData.user.id);
  } finally {
    lease.release();
  }
}

async function handlePostAuthenticated(
  req: NextRequest,
  server: NonNullable<ReturnType<typeof getServerSupabaseClient>>,
  jwt: string,
  userId: string,
): Promise<NextResponse> {
  let body: z.infer<typeof requestSchema>;
  try {
    body = requestSchema.parse(await readBoundedJson(req, MAX_JSON_BODY_BYTES));
  } catch (err) {
    if (err instanceof BodyTooLargeError) {
      return NextResponse.json(
        { error: 'request_body_too_large', detail: 'La requête dépasse la taille maximale autorisée.' },
        { status: 413 },
      );
    }
    return NextResponse.json(
      { error: 'bad_request', detail: err instanceof z.ZodError ? err.issues.map((i) => i.message).join('; ') : 'invalid body' },
      { status: 400 },
    );
  }

  if (!OBJECT_ID_SHAPE.test(body.object_id)) {
    return NextResponse.json({ error: 'invalid_object_id' }, { status: 400 });
  }

  if (isRateLimited(userId)) {
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

  // Resolve and validate before decoding any image.  This is deliberately a configuration
  // read only: an absent, malformed, or unsupported provider must not consume sharp/CPU.
  let configuredProvider;
  try {
    configuredProvider = await resolveActiveAiProvider(server, req.signal);
  } catch {
    return NextResponse.json({ error: 'provider_unavailable', detail: 'La configuration IA est indisponible.' }, { status: 503 });
  }
  if (!configuredProvider) {
    return NextResponse.json({ error: 'not_configured', detail: 'Aucun fournisseur IA compatible actif.' }, { status: 503 });
  }

  // Cap image count (cost) and re-encode each (resize + EXIF strip) before sending to the provider.
  // Prepared SEQUENTIALLY, not via Promise.all: a rejection from one image must not leave OTHER
  // sharp jobs still running in the background after this function returns — Promise.all rejects
  // as soon as the first mapped promise rejects, but does not cancel or await the rest, so the
  // 'ai' lease (see acquireLease above) would be released in the outer `finally` while sibling
  // preparations were still consuming CPU/memory, defeating the concurrency ceiling. Awaiting one
  // image at a time guarantees that by the time we throw, no other preparation has even started
  // (also lower peak memory than decoding all selected images concurrently).
  const truncated = body.images.length > MAX_VISION_IMAGES;
  const selected = body.images.slice(0, MAX_VISION_IMAGES);
  const preparedImages: Awaited<ReturnType<typeof prepareVisionImage>>[] = [];
  try {
    for (const img of selected) {
      const buf = Buffer.from(img.base64, 'base64');
      if (buf.byteLength > MAX_IMAGE_BYTES) {
        throw new MediaProcessingError('size', 'image trop volumineuse');
      }
      preparedImages.push(await prepareVisionImage(buf, img.mime));
    }
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      const status = err.code === 'size' ? 413 : 415;
      return NextResponse.json({ error: err.code, detail: err.message }, { status });
    }
    return NextResponse.json({ error: 'image_prep_failed', detail: err instanceof Error ? err.message : 'unknown' }, { status: 400 });
  }

  // Re-read immediately before the provider request.  If an administrator has disabled
  // the service while images were being prepared, orchestration receives no stale config.
  const controller = new AbortController();
  const getActiveProvider = () => resolveActiveAiProvider(server, controller.signal);
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
