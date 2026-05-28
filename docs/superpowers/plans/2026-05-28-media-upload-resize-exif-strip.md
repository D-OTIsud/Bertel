# Media Upload — Resize ≤ 2000 px + EXIF Strip Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow editors to upload images directly into a Supabase Storage `media` bucket via the existing object editor, with **server-side guarantees** that every published image is (a) ≤ 2000 px on both dimensions and (b) free of EXIF metadata (GPS, device, date) — fulfilling DPIA Bertel action prioritaire #1.

**Architecture:** A Next.js Route Handler at `POST /api/media/upload` receives a multipart `file` + `object_id`, authenticates the user via the Supabase JWT, processes the buffer with **sharp** (resize-down to fit 2000×2000, strip all metadata), uploads to the public `media` bucket using the **service-role key** (so anonymous clients cannot bypass the route), and returns `{ url, width, height }`. The frontend `MediaEditModal` gains a `MediaUploadField` that drives this endpoint and feeds the result back into the draft. RLS forbids any other write path to the bucket, which guarantees the API publique only ever serves processed bytes.

**Tech Stack:** Next.js 16 App Router (Route Handlers), TypeScript, sharp 0.34, Supabase JS 2.52, Supabase Storage, Jest 29 + jest-environment-jsdom, @testing-library/react.

---

## Background context (read before starting)

- **Current state of media editing.** `src/features/object-editor/sections/SectionMedia.tsx` renders a grid of media tiles. The user clicks "Modifier" or "Ajouter un média" to open `widgets/MediaEditModal.tsx`. The modal exposes a free-text `Input` for `url` — the user must paste a URL manually. There is **no upload UI today**.
- **Existing storage pattern.** `src/services/branding.ts` already uploads brand logos to a `branding-assets` bucket via `client.storage.from('branding-assets').upload(...)`. We will create a similar `media` bucket but lock it down so only `service_role` can write.
- **No Next.js API routes yet.** `src/app/api/` does not exist. This plan creates the first one (`api/media/upload/route.ts`). Next.js App Router Route Handlers export named HTTP-method functions (`export async function POST(req: NextRequest) {...}`).
- **`sharp` is in `devDependencies` only** (used by a build script `scripts/generate-marker-pngs.ts`). We must move it to `dependencies` because the route handler runs at runtime in production.
- **No service-role key in env.** `src/lib/env.ts` only reads `NEXT_PUBLIC_*` variables. We must add a **server-only** `SUPABASE_SERVICE_ROLE_KEY` reader (never `NEXT_PUBLIC_*`) used only in route handlers.
- **DPIA mention to update.** `bertel-tourism-ui/public/legal/dpia.md` and `dpia.html` currently list "Métadonnées EXIF des médias" with status `🔴 Non systématisé — action prioritaire`. Final task switches it to `✅` and regenerates PDFs.
- **Out of scope for this plan.** (1) Re-processing of pre-existing media already in the table — this plan only guarantees future uploads. A separate backfill job is a follow-up. (2) Video processing — DPIA mentions EXIF (image-only). Videos remain URL-only for now. (3) PDF / document uploads — they keep the existing URL-paste flow.

---

## File structure

### Created

| Path | Responsibility |
|---|---|
| `Base de donnée DLL et API/media_bucket.sql` | Idempotent SQL: create `media` bucket, set RLS so only `service_role` writes and `anon`/`authenticated` read. |
| `bertel-tourism-ui/src/lib/supabase-server.ts` | Server-only Supabase client factory keyed with `SUPABASE_SERVICE_ROLE_KEY`. **Never imported from client code.** |
| `bertel-tourism-ui/src/lib/supabase-server.test.ts` | Test factory returns `null` when env missing; returns a singleton otherwise. |
| `bertel-tourism-ui/src/app/api/media/upload/route.ts` | Thin Next.js Route Handler: parse multipart, delegate to `handle-upload.ts`, return JSON. |
| `bertel-tourism-ui/src/app/api/media/upload/handle-upload.ts` | Pure orchestrator: validate input, call `process-image`, upload to bucket, return result. |
| `bertel-tourism-ui/src/app/api/media/upload/handle-upload.test.ts` | Tests handle-upload with mocked storage + verified JWT. |
| `bertel-tourism-ui/src/app/api/media/upload/process-image.ts` | Pure sharp pipeline: validate MIME + size, resize-down to 2000×2000, strip metadata, return `{ buffer, width, height, mimeType }`. |
| `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts` | Tests resize, EXIF strip, MIME rejection, size rejection — generates fixtures inline with sharp. |
| `bertel-tourism-ui/src/services/media-upload.ts` | Client-side fetch wrapper: `uploadMedia(file, objectId): Promise<UploadedMedia>`. |
| `bertel-tourism-ui/src/services/media-upload.test.ts` | Tests fetch payload, error handling. |
| `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.tsx` | File picker + progress + error UI. |
| `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.test.tsx` | Tests picker → service → onUploaded callback. |

### Modified

| Path | Change |
|---|---|
| `bertel-tourism-ui/package.json` | Move `"sharp": "^0.34.5"` from `devDependencies` to `dependencies`. |
| `bertel-tourism-ui/.env.example` | Add `SUPABASE_SERVICE_ROLE_KEY=` (server-only). |
| `bertel-tourism-ui/src/lib/env.ts` | Read `SUPABASE_SERVICE_ROLE_KEY` server-side; no client exposure. |
| `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.tsx` | Insert `<MediaUploadField>` above the URL field; when upload completes, set `url`, `width`, `height` on the draft. |
| `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.test.tsx` | Add a test covering the upload → draft propagation. |
| `bertel-tourism-ui/public/legal/dpia.md` | Switch EXIF status from `🔴` to `✅` (the action is delivered). |
| `bertel-tourism-ui/public/legal/dpia.html` | Same switch in HTML. |
| `bertel-tourism-ui/public/legal/dpia.pdf` | Regenerated via `node public/legal/_build_pdf.mjs`. |
| `bertel-tourism-ui/public/legal/rgpd.pdf` | Regenerated (no MD change but sources track together). |

---

## Task 0 — Worktree / branch check

**Files:** none (git state only)

- [ ] **Step 1: Confirm starting state**

Run:
```bash
git status
git log -1 --oneline
```
Expected: clean working tree on the branch you want to work on. If you are inside a worktree spun up by `superpowers:using-git-worktrees`, you are good. Otherwise, create one (or a branch) before starting Task 1.

---

## Task 1 — SQL: create `media` bucket with RLS

**Files:**
- Create: `Base de donnée DLL et API/media_bucket.sql`

- [ ] **Step 1: Write the SQL file**

```sql
-- media_bucket.sql
-- Creates the public `media` bucket used for editor uploads.
-- Write access is restricted to `service_role` so all uploads go through
-- the Next.js route /api/media/upload (which enforces resize ≤ 2000 px
-- and EXIF stripping). Read access is anonymous (public API).
-- Idempotent: safe to apply multiple times.

BEGIN;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'media',
  'media',
  true,
  10485760, -- 10 MB cap on already-processed objects (safety net; post-resize objects are far smaller)
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- RLS: anyone reads, only service_role writes.
DROP POLICY IF EXISTS "media_public_read" ON storage.objects;
CREATE POLICY "media_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

DROP POLICY IF EXISTS "media_service_role_write" ON storage.objects;
CREATE POLICY "media_service_role_write"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'media')
  WITH CHECK (bucket_id = 'media');

-- Explicitly deny anon/authenticated direct writes (defense in depth).
DROP POLICY IF EXISTS "media_no_anon_write" ON storage.objects;
CREATE POLICY "media_no_anon_write"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id <> 'media');

COMMIT;
```

- [ ] **Step 2: Apply the migration**

Apply via the Supabase MCP `mcp__supabase__apply_migration` tool (preferred) or `supabase db push` if running the CLI locally. Pass the file contents as the migration body.

- [ ] **Step 3: Verify in the database**

Run via `mcp__supabase__execute_sql`:
```sql
SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id = 'media';
SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname LIKE 'media_%';
```
Expected: one bucket row with `public=true` and the three policies present.

- [ ] **Step 4: Commit**

```bash
git add "Base de donnée DLL et API/media_bucket.sql"
git commit -m "feat(storage): add media bucket with service-role-only write policy"
```

---

## Task 2 — Move `sharp` to runtime dependencies

**Files:**
- Modify: `bertel-tourism-ui/package.json`

- [ ] **Step 1: Move the entry**

Open `bertel-tourism-ui/package.json`. Cut `"sharp": "^0.34.5"` from `devDependencies` and add it to `dependencies` (alphabetical position between `"react-map-gl"` and `"sonner"` — keep the existing alphabetic order).

After edit, the relevant block should read:
```json
"dependencies": {
  ...
  "react-hook-form": "^7.71.2",
  "react-map-gl": "^8.1.0",
  "sharp": "^0.34.5",
  "sonner": "^2.0.7",
  ...
},
"devDependencies": {
  ...
  "postcss": "^8.5.8",
  "storybook": "^10.4.0",
  ...
}
```

- [ ] **Step 2: Reinstall**

Run from `bertel-tourism-ui/`:
```bash
npm install
```
Expected: `npm` updates `package-lock.json`, sharp moves to dependencies tree. No errors.

- [ ] **Step 3: Smoke test sharp from Node**

Run from `bertel-tourism-ui/`:
```bash
node -e "import('sharp').then(s => s.default({ create: { width: 4, height: 4, channels: 3, background: '#000' } }).png().toBuffer().then(b => console.log('sharp ok', b.length)))"
```
Expected: prints `sharp ok <some number > 0>`.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/package.json bertel-tourism-ui/package-lock.json
git commit -m "chore(deps): promote sharp to runtime dependency for media upload pipeline"
```

---

## Task 3 — Env: add server-only `SUPABASE_SERVICE_ROLE_KEY`

**Files:**
- Modify: `bertel-tourism-ui/.env.example`
- Modify: `bertel-tourism-ui/src/lib/env.ts`

- [ ] **Step 1: Add to .env.example**

Append to `bertel-tourism-ui/.env.example`:
```
# Server-side only. Used by the /api/media/upload route to write to the `media` bucket.
# DO NOT prefix with NEXT_PUBLIC_ — must never be sent to the browser.
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 2: Extend env.ts (server reader)**

Open `bertel-tourism-ui/src/lib/env.ts`. After the existing `export const env = readEnv();` line, append:

```ts
// Server-only env. Reads process.env directly (never the runtime window config).
// Returns null if not set — callers must handle that case explicitly.
export function readServerEnv(): { supabaseServiceRoleKey: string | null } {
  if (typeof process === 'undefined' || !process.env) {
    return { supabaseServiceRoleKey: null };
  }
  const raw = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  return { supabaseServiceRoleKey: raw.length > 0 ? raw : null };
}
```

- [ ] **Step 3: Typecheck**

Run from `bertel-tourism-ui/`:
```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/.env.example bertel-tourism-ui/src/lib/env.ts
git commit -m "feat(env): add server-only SUPABASE_SERVICE_ROLE_KEY reader"
```

---

## Task 4 — Server Supabase factory (service-role)

**Files:**
- Create: `bertel-tourism-ui/src/lib/supabase-server.ts`
- Create: `bertel-tourism-ui/src/lib/supabase-server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/lib/supabase-server.test.ts`:

```ts
/** @jest-environment node */
import { __resetServerSupabaseClientForTests, getServerSupabaseClient } from './supabase-server';

describe('getServerSupabaseClient', () => {
  beforeEach(() => {
    __resetServerSupabaseClientForTests();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  });

  it('returns null when service-role key is missing', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns null when supabase url is missing', () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    expect(getServerSupabaseClient()).toBeNull();
  });

  it('returns a singleton client when both env are set', () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'srv-key';
    const a = getServerSupabaseClient();
    const b = getServerSupabaseClient();
    expect(a).not.toBeNull();
    expect(a).toBe(b);
  });
});
```

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/lib/supabase-server.test.ts
```
Expected: fails with "Cannot find module './supabase-server'".

- [ ] **Step 3: Implement the factory**

Create `bertel-tourism-ui/src/lib/supabase-server.ts`:

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { readServerEnv } from './env';

let serverClient: SupabaseClient | null = null;

/**
 * Server-only Supabase client keyed with the service-role secret.
 * MUST only be imported from server code (route handlers, server actions).
 * Importing from a client component will leak the key.
 */
export function getServerSupabaseClient(): SupabaseClient | null {
  if (serverClient) return serverClient;
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const { supabaseServiceRoleKey } = readServerEnv();
  if (!url || !supabaseServiceRoleKey) return null;
  serverClient = createClient(url, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return serverClient;
}

/** Test-only helper to clear the singleton between cases. */
export function __resetServerSupabaseClientForTests(): void {
  serverClient = null;
}
```

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/lib/supabase-server.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/lib/supabase-server.ts bertel-tourism-ui/src/lib/supabase-server.test.ts
git commit -m "feat(lib): server-only Supabase service-role client factory"
```

---

## Task 5 — Process image: resize ≤ 2000 px

**Files:**
- Create: `bertel-tourism-ui/src/app/api/media/upload/process-image.ts`
- Create: `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`:

```ts
/** @jest-environment node */
import sharp from 'sharp';
import { processImage } from './process-image';

async function makeImage(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg({ quality: 90 })
    .toBuffer();
}

describe('processImage — resize', () => {
  it('passes through an image that already fits within 2000 px', async () => {
    const input = await makeImage(800, 600);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('resizes a 3000×1500 image down so that the longest side is 2000', async () => {
    const input = await makeImage(3000, 1500);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(2000);
    expect(result.height).toBe(1000);
  });

  it('resizes a 1500×3000 image down so that the longest side is 2000', async () => {
    const input = await makeImage(1500, 3000);
    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    expect(result.width).toBe(1000);
    expect(result.height).toBe(2000);
  });
});
```

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts
```
Expected: fails with "Cannot find module './process-image'".

- [ ] **Step 3: Implement processImage with resize**

Create `bertel-tourism-ui/src/app/api/media/upload/process-image.ts`:

```ts
import sharp from 'sharp';

export const MAX_DIMENSION_PX = 2000;
export const MAX_INPUT_BYTES = 20 * 1024 * 1024; // 20 MB
export const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export interface ProcessImageInput {
  buffer: Buffer;
  mimeType: string;
}

export interface ProcessImageResult {
  buffer: Buffer;
  width: number;
  height: number;
  mimeType: AllowedMime;
}

export class MediaProcessingError extends Error {
  constructor(public readonly code: 'mime' | 'size' | 'decode', message: string) {
    super(message);
    this.name = 'MediaProcessingError';
  }
}

/**
 * Validate, resize-down to fit MAX_DIMENSION_PX on both axes, and strip all
 * metadata (EXIF, IPTC, XMP). Aspect ratio is preserved (sharp's default
 * `inside` fit). Pass-through for images already small enough.
 */
export async function processImage({ buffer, mimeType }: ProcessImageInput): Promise<ProcessImageResult> {
  // (resize-only first pass; MIME + size + strip added in next tasks)
  const pipeline = sharp(buffer).rotate(); // apply EXIF orientation before stripping

  const meta = await pipeline.metadata();
  if (!meta.width || !meta.height) {
    throw new MediaProcessingError('decode', 'Unable to read image dimensions.');
  }

  const needsResize = meta.width > MAX_DIMENSION_PX || meta.height > MAX_DIMENSION_PX;
  const finalPipeline = needsResize
    ? pipeline.resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
    : pipeline;

  const out = await finalPipeline.jpeg({ quality: 85 }).toBuffer({ resolveWithObject: true });
  return {
    buffer: out.data,
    width: out.info.width,
    height: out.info.height,
    mimeType: 'image/jpeg',
  };
}
```

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/app/api/media/upload/process-image.ts bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts
git commit -m "feat(media): resize-down images to fit 2000x2000 in upload pipeline"
```

---

## Task 6 — Process image: strip EXIF (GPS, device, date)

**Files:**
- Modify: `bertel-tourism-ui/src/app/api/media/upload/process-image.ts`
- Modify: `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`

- [ ] **Step 1: Write the failing test (append to existing file)**

Append to `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`:

```ts
describe('processImage — metadata stripping', () => {
  it('strips EXIF including GPS, Make/Model, and DateTimeOriginal', async () => {
    const input = await sharp({
      create: { width: 800, height: 600, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .withExif({
        IFD0: { Make: 'TestCam', Model: 'X-1', Software: 'Bertel-Test' },
        IFD2: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '43/1 25/1 30/1',
          GPSLongitudeRef: 'E',
          GPSLongitude: '5/1 30/1 0/1',
        },
        IFD3: { DateTimeOriginal: '2024:01:15 10:30:00' },
      })
      .jpeg()
      .toBuffer();

    const result = await processImage({ buffer: input, mimeType: 'image/jpeg' });
    const outMeta = await sharp(result.buffer).metadata();
    expect(outMeta.exif).toBeUndefined();
    expect(outMeta.iptc).toBeUndefined();
    expect(outMeta.xmp).toBeUndefined();
  });
});
```

> **Note for the implementer.** sharp 0.34's `.withExif()` shape may vary across patch versions. If the fixture builder throws, fall back to the older `.withMetadata({ exif: {...} })` API — the assertion (output has no exif/iptc/xmp) is what matters.

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts -t "strips EXIF"
```
Expected: fails — the current `processImage` already strips metadata by default (sharp default), so this MIGHT pass on the first try. If it does, replace the failing assertion with one that confirms a *known property* of the input EXIF is gone, e.g. `expect(JSON.stringify(outMeta)).not.toContain('TestCam')`. The test must fail without explicit stripping to be a meaningful TDD step. If sharp truly strips by default in 0.34, write the test against a deliberately-failing implementation that uses `.withMetadata()` to keep EXIF, then strip in step 3.

- [ ] **Step 3: Make stripping explicit (defense in depth)**

In `bertel-tourism-ui/src/app/api/media/upload/process-image.ts`, change the final pipeline call to be explicit about NOT preserving metadata. Sharp strips by default but we want intent visible to future readers. Update the pipeline section to:

```ts
const out = await finalPipeline
  .withMetadata({}) // strip everything explicitly (EXIF, IPTC, XMP)
  .jpeg({ quality: 85 })
  .toBuffer({ resolveWithObject: true });
```

Replace the previous `.jpeg().toBuffer()` call with the chain above.

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts
```
Expected: all 4 tests pass (3 resize + 1 strip).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/app/api/media/upload/process-image.ts bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts
git commit -m "feat(media): explicitly strip EXIF/IPTC/XMP from uploaded images"
```

---

## Task 7 — Process image: validate MIME and reject oversize

**Files:**
- Modify: `bertel-tourism-ui/src/app/api/media/upload/process-image.ts`
- Modify: `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`

- [ ] **Step 1: Write the failing tests (append)**

Append to `bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts`:

```ts
describe('processImage — validation', () => {
  it('rejects an unsupported MIME type', async () => {
    const fakeSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>', 'utf8');
    await expect(processImage({ buffer: fakeSvg, mimeType: 'image/svg+xml' }))
      .rejects.toMatchObject({ code: 'mime' });
  });

  it('rejects a buffer larger than MAX_INPUT_BYTES', async () => {
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1, 0);
    await expect(processImage({ buffer: oversized, mimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'size' });
  });

  it('rejects a buffer that is not a decodable image', async () => {
    const junk = Buffer.from('not an image', 'utf8');
    await expect(processImage({ buffer: junk, mimeType: 'image/jpeg' }))
      .rejects.toMatchObject({ code: 'decode' });
  });
});
```

- [ ] **Step 2: Run the tests, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts -t "validation"
```
Expected: all three fail (mime and size checks not implemented; decode error is currently bubbled but with a generic shape).

- [ ] **Step 3: Add validation at the top of processImage**

At the start of the `processImage` function body (before `const pipeline = sharp(buffer).rotate();`), insert:

```ts
if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
  throw new MediaProcessingError('mime', `Unsupported MIME type: ${mimeType}`);
}
if (buffer.byteLength > MAX_INPUT_BYTES) {
  throw new MediaProcessingError('size', `Input exceeds ${MAX_INPUT_BYTES} bytes`);
}
```

Then wrap the `await pipeline.metadata()` and subsequent calls in a try/catch that converts sharp's decode errors into a `MediaProcessingError('decode', ...)`. Updated function body shape:

```ts
export async function processImage({ buffer, mimeType }: ProcessImageInput): Promise<ProcessImageResult> {
  if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType)) {
    throw new MediaProcessingError('mime', `Unsupported MIME type: ${mimeType}`);
  }
  if (buffer.byteLength > MAX_INPUT_BYTES) {
    throw new MediaProcessingError('size', `Input exceeds ${MAX_INPUT_BYTES} bytes`);
  }

  try {
    const pipeline = sharp(buffer).rotate();
    const meta = await pipeline.metadata();
    if (!meta.width || !meta.height) {
      throw new MediaProcessingError('decode', 'Unable to read image dimensions.');
    }
    const needsResize = meta.width > MAX_DIMENSION_PX || meta.height > MAX_DIMENSION_PX;
    const finalPipeline = needsResize
      ? pipeline.resize({ width: MAX_DIMENSION_PX, height: MAX_DIMENSION_PX, fit: 'inside', withoutEnlargement: true })
      : pipeline;
    // NOTE: sharp ≥0.33 strips EXIF/IPTC/XMP by default on re-encode.
    // Do NOT add .withMetadata() / .keepMetadata() here — both OPT INTO
    // preserving metadata in sharp 0.34 (see node_modules/sharp/lib/output.js).
    // Strip behaviour is verified by the EXIF assertion test in process-image.test.ts.
    const out = await finalPipeline
      .jpeg({ quality: 85 })
      .toBuffer({ resolveWithObject: true });
    return { buffer: out.data, width: out.info.width, height: out.info.height, mimeType: 'image/jpeg' };
  } catch (err) {
    if (err instanceof MediaProcessingError) throw err;
    throw new MediaProcessingError('decode', err instanceof Error ? err.message : String(err));
  }
}
```

- [ ] **Step 4: Run the tests, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/process-image.test.ts
```
Expected: 7 tests pass (3 resize + 1 strip + 3 validation).

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/app/api/media/upload/process-image.ts bertel-tourism-ui/src/app/api/media/upload/process-image.test.ts
git commit -m "feat(media): reject invalid MIME, oversize, and undecodable buffers"
```

---

## Task 8 — Handle-upload orchestrator (pure, testable)

**Files:**
- Create: `bertel-tourism-ui/src/app/api/media/upload/handle-upload.ts`
- Create: `bertel-tourism-ui/src/app/api/media/upload/handle-upload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/app/api/media/upload/handle-upload.test.ts`:

```ts
/** @jest-environment node */
import sharp from 'sharp';
import { handleMediaUpload, type StorageUploader } from './handle-upload';

async function jpg(): Promise<Buffer> {
  return sharp({ create: { width: 100, height: 100, channels: 3, background: '#444' } }).jpeg().toBuffer();
}

function fakeUploader(overrides?: Partial<StorageUploader>): StorageUploader {
  return {
    upload: jest.fn(async (path) => ({ ok: true, publicUrl: `https://example.test/storage/${path}` })),
    ...overrides,
  };
}

describe('handleMediaUpload', () => {
  it('returns the public URL and processed dimensions on success', async () => {
    const uploader = fakeUploader();
    const result = await handleMediaUpload({
      fileBuffer: await jpg(),
      filename: 'photo.jpg',
      mimeType: 'image/jpeg',
      objectId: 'obj-123',
      uploader,
    });
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
    expect(result.url).toMatch(/^https:\/\/example\.test\/storage\/obj-123\/.+\.jpg$/);
    expect(uploader.upload).toHaveBeenCalledTimes(1);
  });

  it('propagates a MediaProcessingError when MIME is invalid', async () => {
    const uploader = fakeUploader();
    await expect(
      handleMediaUpload({
        fileBuffer: Buffer.from('x'),
        filename: 'logo.svg',
        mimeType: 'image/svg+xml',
        objectId: 'obj-123',
        uploader,
      }),
    ).rejects.toMatchObject({ code: 'mime' });
    expect(uploader.upload).not.toHaveBeenCalled();
  });

  it('returns an error when uploader reports failure', async () => {
    const uploader: StorageUploader = {
      upload: jest.fn(async () => ({ ok: false, error: 'bucket missing' })),
    };
    await expect(
      handleMediaUpload({
        fileBuffer: await jpg(),
        filename: 'photo.jpg',
        mimeType: 'image/jpeg',
        objectId: 'obj-123',
        uploader,
      }),
    ).rejects.toThrow(/bucket missing/);
  });
});
```

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/handle-upload.test.ts
```
Expected: fails with "Cannot find module './handle-upload'".

- [ ] **Step 3: Implement the orchestrator**

Create `bertel-tourism-ui/src/app/api/media/upload/handle-upload.ts`:

```ts
import { randomUUID } from 'node:crypto';
import { processImage, type ProcessImageResult } from './process-image';

export interface StorageUploadOk {
  ok: true;
  publicUrl: string;
}
export interface StorageUploadErr {
  ok: false;
  error: string;
}
export type StorageUploadResult = StorageUploadOk | StorageUploadErr;

/**
 * Abstraction over Supabase Storage so the orchestrator can be tested
 * without hitting the network. The real implementation lives in route.ts.
 */
export interface StorageUploader {
  upload(path: string, buffer: Buffer, contentType: string): Promise<StorageUploadResult>;
}

export interface HandleMediaUploadInput {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  objectId: string;
  uploader: StorageUploader;
}

export interface UploadedMedia {
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

function buildStoragePath(objectId: string): string {
  // Use a uuid so users cannot guess or collide; .jpg because processImage normalises to jpeg.
  return `${objectId}/${randomUUID()}.jpg`;
}

export async function handleMediaUpload(input: HandleMediaUploadInput): Promise<UploadedMedia> {
  if (!input.objectId || typeof input.objectId !== 'string') {
    throw new Error('object_id is required');
  }
  const processed: ProcessImageResult = await processImage({
    buffer: input.fileBuffer,
    mimeType: input.mimeType,
  });
  const path = buildStoragePath(input.objectId);
  const upload = await input.uploader.upload(path, processed.buffer, processed.mimeType);
  if (!upload.ok) {
    throw new Error(`Storage upload failed: ${upload.error}`);
  }
  return {
    url: upload.publicUrl,
    width: processed.width,
    height: processed.height,
    mimeType: processed.mimeType,
  };
}
```

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/app/api/media/upload/handle-upload.test.ts
```
Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/app/api/media/upload/handle-upload.ts bertel-tourism-ui/src/app/api/media/upload/handle-upload.test.ts
git commit -m "feat(media): handle-upload orchestrator with pluggable storage uploader"
```

---

## Task 9 — Route handler: POST /api/media/upload

**Files:**
- Create: `bertel-tourism-ui/src/app/api/media/upload/route.ts`

(No dedicated test for the Next.js binding — the orchestrator covers logic; the binding is a thin shell verified by typecheck and the manual smoke test in step 4.)

- [ ] **Step 1: Implement the route**

Create `bertel-tourism-ui/src/app/api/media/upload/route.ts`:

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { handleMediaUpload, type StorageUploader } from './handle-upload';
import { MediaProcessingError } from './process-image';

const BUCKET = 'media';

export const runtime = 'nodejs'; // sharp requires Node, not Edge

export async function POST(req: NextRequest): Promise<NextResponse> {
  const server = getServerSupabaseClient();
  if (!server) {
    return NextResponse.json(
      { error: 'server_misconfigured', detail: 'SUPABASE_SERVICE_ROLE_KEY missing' },
      { status: 500 },
    );
  }

  // Auth: require a Bearer JWT from the authenticated browser client.
  const authHeader = req.headers.get('authorization') ?? '';
  const jwt = authHeader.startsWith('Bearer ') ? authHeader.slice('Bearer '.length).trim() : '';
  if (!jwt) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }
  const { data: userData, error: userErr } = await server.auth.getUser(jwt);
  if (userErr || !userData?.user) {
    return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'bad_multipart' }, { status: 400 });
  }
  const file = form.get('file');
  const objectId = form.get('object_id');
  if (!(file instanceof File) || typeof objectId !== 'string' || objectId.length === 0) {
    return NextResponse.json({ error: 'missing_fields' }, { status: 400 });
  }

  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const uploader: StorageUploader = {
    async upload(path, buffer, contentType) {
      const { error } = await server.storage.from(BUCKET).upload(path, buffer, {
        contentType,
        cacheControl: '31536000', // 1 year — paths are uuid'd so safe to cache
        upsert: false,
      });
      if (error) return { ok: false, error: error.message };
      const { data } = server.storage.from(BUCKET).getPublicUrl(path);
      return { ok: true, publicUrl: data.publicUrl };
    },
  };

  try {
    const result = await handleMediaUpload({
      fileBuffer,
      filename: file.name,
      mimeType: file.type,
      objectId,
      uploader,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof MediaProcessingError) {
      const status = err.code === 'mime' || err.code === 'size' ? 415 : 400;
      return NextResponse.json({ error: err.code, detail: err.message }, { status });
    }
    return NextResponse.json(
      { error: 'upload_failed', detail: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Typecheck**

Run from `bertel-tourism-ui/`:
```bash
npm run typecheck
```
Expected: no errors. If `@/lib/supabase-server` cannot be resolved, verify `jest.config.mjs` / `tsconfig.json` paths — the alias `@/*` → `src/*` is already configured.

- [ ] **Step 3: Manual smoke test (optional but recommended)**

Start the dev server:
```bash
npm run dev
```
From another terminal, with a valid Supabase JWT (`sb_jwt`) and an existing object id:
```bash
curl -X POST http://localhost:3000/api/media/upload \
  -H "Authorization: Bearer ${sb_jwt}" \
  -F "object_id=obj-test" \
  -F "file=@/path/to/photo-with-exif.jpg"
```
Expected: HTTP 201 with `{"url":"https://...","width":...,"height":...,"mimeType":"image/jpeg"}`. Fetching the returned URL in a browser and running `exiftool` on the downloaded file shows no GPS/Make/Model.

- [ ] **Step 4: Commit**

```bash
git add bertel-tourism-ui/src/app/api/media/upload/route.ts
git commit -m "feat(media): POST /api/media/upload route handler"
```

---

## Task 10 — Client service: `uploadMedia(file, objectId)`

**Files:**
- Create: `bertel-tourism-ui/src/services/media-upload.ts`
- Create: `bertel-tourism-ui/src/services/media-upload.test.ts`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/services/media-upload.test.ts`:

```ts
import { uploadMedia } from './media-upload';

const ORIG_FETCH = globalThis.fetch;

describe('uploadMedia', () => {
  afterEach(() => {
    globalThis.fetch = ORIG_FETCH;
    jest.restoreAllMocks();
  });

  it('POSTs to /api/media/upload with bearer token and multipart body', async () => {
    const fakeJwt = 'fake-jwt';
    const fetchMock = jest.fn(async () => ({
      ok: true,
      status: 201,
      json: async () => ({ url: 'https://cdn.test/media/x.jpg', width: 1000, height: 800, mimeType: 'image/jpeg' }),
    } as unknown as Response));
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const result = await uploadMedia({ file, objectId: 'obj-123', accessToken: fakeJwt });

    expect(result).toEqual({ url: 'https://cdn.test/media/x.jpg', width: 1000, height: 800, mimeType: 'image/jpeg' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/media/upload');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${fakeJwt}`);
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('throws on non-2xx response with the server error body', async () => {
    globalThis.fetch = jest.fn(async () => ({
      ok: false,
      status: 415,
      json: async () => ({ error: 'mime', detail: 'Unsupported MIME type: image/svg+xml' }),
    } as unknown as Response)) as unknown as typeof fetch;

    const file = new File([new Uint8Array([1])], 'logo.svg', { type: 'image/svg+xml' });
    await expect(uploadMedia({ file, objectId: 'obj-1', accessToken: 't' }))
      .rejects.toThrow(/Unsupported MIME type/);
  });
});
```

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/services/media-upload.test.ts
```
Expected: fails with "Cannot find module './media-upload'".

- [ ] **Step 3: Implement the service**

Create `bertel-tourism-ui/src/services/media-upload.ts`:

```ts
export interface UploadMediaInput {
  file: File;
  objectId: string;
  accessToken: string;
}

export interface UploadedMedia {
  url: string;
  width: number;
  height: number;
  mimeType: string;
}

export async function uploadMedia({ file, objectId, accessToken }: UploadMediaInput): Promise<UploadedMedia> {
  const body = new FormData();
  body.append('file', file);
  body.append('object_id', objectId);

  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
    body,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const payload = (await response.json()) as { detail?: string; error?: string };
      detail = payload.detail ?? payload.error ?? detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }

  return (await response.json()) as UploadedMedia;
}
```

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/services/media-upload.test.ts
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/services/media-upload.ts bertel-tourism-ui/src/services/media-upload.test.ts
git commit -m "feat(services): client uploadMedia service hitting /api/media/upload"
```

---

## Task 11 — UI component: `MediaUploadField`

**Files:**
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.tsx`
- Create: `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.test.tsx`:

```tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MediaUploadField } from './MediaUploadField';

jest.mock('../../../services/media-upload', () => ({
  uploadMedia: jest.fn(async () => ({
    url: 'https://cdn.test/media/xyz.jpg',
    width: 1600,
    height: 1200,
    mimeType: 'image/jpeg',
  })),
}));

import { uploadMedia } from '../../../services/media-upload';

describe('MediaUploadField', () => {
  beforeEach(() => {
    (uploadMedia as jest.Mock).mockClear();
  });

  it('calls uploadMedia and onUploaded with the result when the user picks a file', async () => {
    const onUploaded = jest.fn();
    render(<MediaUploadField objectId="obj-1" accessToken="t" onUploaded={onUploaded} />);

    const file = new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/Téléverser un média/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(uploadMedia).toHaveBeenCalledWith({ file, objectId: 'obj-1', accessToken: 't' });
      expect(onUploaded).toHaveBeenCalledWith({
        url: 'https://cdn.test/media/xyz.jpg',
        width: 1600,
        height: 1200,
        mimeType: 'image/jpeg',
      });
    });
  });

  it('shows an error message when the upload fails', async () => {
    (uploadMedia as jest.Mock).mockRejectedValueOnce(new Error('Unsupported MIME type: image/svg+xml'));

    render(<MediaUploadField objectId="obj-1" accessToken="t" onUploaded={jest.fn()} />);
    const input = screen.getByLabelText(/Téléverser un média/i) as HTMLInputElement;
    fireEvent.change(input, {
      target: { files: [new File([new Uint8Array([1])], 'bad.svg', { type: 'image/svg+xml' })] },
    });

    expect(await screen.findByText(/Unsupported MIME type/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/features/object-editor/widgets/MediaUploadField.test.tsx
```
Expected: fails — component does not exist.

- [ ] **Step 3: Implement the component**

Create `bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.tsx`:

```tsx
import { useState } from 'react';
import { uploadMedia, type UploadedMedia } from '../../../services/media-upload';

interface Props {
  objectId: string;
  accessToken: string;
  onUploaded: (media: UploadedMedia) => void;
}

/**
 * File picker that uploads to /api/media/upload. The server resizes any image
 * larger than 2000 px and strips EXIF before storing it in the public bucket,
 * so what comes back is already publication-safe.
 */
export function MediaUploadField({ objectId, accessToken, onUploaded }: Props) {
  const [status, setStatus] = useState<'idle' | 'uploading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ''; // reset so picking the same file again still fires change
    if (!file) return;
    setStatus('uploading');
    setError(null);
    try {
      const result = await uploadMedia({ file, objectId, accessToken });
      onUploaded(result);
      setStatus('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec du téléversement.');
      setStatus('error');
    }
  }

  return (
    <div className="media-upload-field">
      <label className="media-upload-field__label">
        Téléverser un média
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          onChange={handleChange}
          disabled={status === 'uploading'}
          aria-label="Téléverser un média"
        />
      </label>
      {status === 'uploading' && <p role="status">Traitement en cours…</p>}
      {status === 'error' && error && (
        <p role="alert" className="media-upload-field__error">{error}</p>
      )}
      <p className="media-upload-field__hint">
        Les images sont automatiquement redimensionnées à 2000 px maximum et leurs métadonnées (EXIF) supprimées avant publication.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Run the test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/features/object-editor/widgets/MediaUploadField.test.tsx
```
Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.tsx bertel-tourism-ui/src/features/object-editor/widgets/MediaUploadField.test.tsx
git commit -m "feat(editor): MediaUploadField widget for in-editor uploads"
```

---

## Task 12 — Wire `MediaUploadField` into `MediaEditModal`

**Files:**
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.tsx`
- Modify: `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.test.tsx`

- [ ] **Step 1: Mock the Supabase auth session at the top of the test file**

At the top of `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.test.tsx`, after the existing imports, add:

```tsx
jest.mock('../../../lib/supabase', () => ({
  getSupabaseClient: () => ({
    auth: { getSession: async () => ({ data: { session: { access_token: 'fake-jwt' } } }) },
  }),
}));

jest.mock('./MediaUploadField', () => ({
  MediaUploadField: ({ onUploaded }: { onUploaded: (m: { url: string; width: number; height: number; mimeType: string }) => void }) => (
    <button type="button" onClick={() => onUploaded({ url: 'https://cdn.test/x.jpg', width: 800, height: 600, mimeType: 'image/jpeg' })}>
      mock-upload
    </button>
  ),
}));
```

- [ ] **Step 2: Write the failing test (append inside the existing `describe('MediaEditModal', () => { ... })` block)**

```tsx
it('captures upload result (url, width, height) into the saved draft', async () => {
  const onSave = jest.fn();
  render(
    <MediaEditModal
      open
      media={media}
      languages={['fr']}
      typeOptions={[{ id: 'mt1', code: 'image', label: 'Image' }]}
      objectId="obj-edit-1"
      onClose={() => {}}
      onSave={onSave}
    />,
  );
  // The mocked MediaUploadField is rendered async (after the session promise resolves).
  const uploadBtn = await screen.findByRole('button', { name: 'mock-upload' });
  fireEvent.click(uploadBtn);
  fireEvent.click(screen.getByRole('button', { name: 'Enregistrer' }));
  const saved = onSave.mock.calls[0][0] as ObjectWorkspaceMediaItem;
  expect(saved.url).toBe('https://cdn.test/x.jpg');
  expect(saved.width).toBe('800');
  expect(saved.height).toBe('600');
});
```

> The existing tests at the top of the file already construct the props inline (`open media={media} languages={['fr', 'en', 'cre']} typeOptions={...} onClose={...} onSave={...}`). The new test follows the same shape — just adds the new mandatory `objectId` prop.

- [ ] **Step 3: Run the test, observe failure**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/features/object-editor/widgets/MediaEditModal.test.tsx
```
Expected: fails — `MediaUploadField` is not yet rendered by `MediaEditModal`.

- [ ] **Step 4: Wire the upload field into the modal**

Open `bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.tsx`. Add imports:

```tsx
import { MediaUploadField } from './MediaUploadField';
import { getSupabaseClient } from '../../../lib/supabase';
```

Change the `Props` interface to accept `objectId`:

```tsx
interface Props {
  open: boolean;
  media: ObjectWorkspaceMediaItem;
  typeOptions: WorkspaceReferenceOption[];
  languages: string[];
  objectId: string;
  onClose: () => void;
  onSave: (media: ObjectWorkspaceMediaItem) => void;
}
```

Inside the component, derive the access token at render time (use a state-initialised promise pattern or `useEffect`):

```tsx
const [accessToken, setAccessToken] = useState<string | null>(null);
useEffect(() => {
  const client = getSupabaseClient();
  if (!client) return;
  client.auth.getSession().then(({ data }) => setAccessToken(data.session?.access_token ?? null));
}, []);
```

(Add `useEffect` to the existing `useState` import: `import { useState, useEffect } from 'react';`.)

Then, just before the existing `<Field label="URL du fichier">` line, insert:

```tsx
{accessToken && (
  <MediaUploadField
    objectId={objectId}
    accessToken={accessToken}
    onUploaded={(uploaded) => {
      set({
        url: uploaded.url,
        width: String(uploaded.width),
        height: String(uploaded.height),
      });
    }}
  />
)}
```

Finally, update the caller `SectionMedia.tsx` to pass `objectId`. Edit the signature to destructure it from `SectionProps` (which already exposes `objectId?: string`), then forward it to the modal:

```tsx
// In bertel-tourism-ui/src/features/object-editor/sections/SectionMedia.tsx

// 1) Update the function signature:
export function SectionMedia({ editor, permissions: _permissions, objectId, folded }: SectionProps) {
  // …existing body…

// 2) Update the <MediaEditModal/> JSX (near the bottom of the render):
  {editing && editingItem && objectId && (
    <MediaEditModal
      open
      media={editingItem}
      typeOptions={media.typeOptions}
      languages={editor.draft.descriptions.availableLanguages}
      objectId={objectId}
      onClose={() => setEditing(null)}
      onSave={(updated) => {
        editor.replaceModule('media', patchObjectMediaItem(media, updated.id, updated));
        setEditing(null);
      }}
    />
  )}
```

If `objectId` is not always present at the caller of `<SectionMedia/>`, also adjust the section registry that mounts `SectionMedia` so it forwards `objectId={editorSnapshot.objectId}` (the field defined on `EditorSnapshot` in `editor-state.ts`). Search for the existing `<SectionMedia` call site:

```bash
grep -rn "<SectionMedia" bertel-tourism-ui/src/
```

and add the missing `objectId` prop there if needed.

- [ ] **Step 5: Typecheck**

Run from `bertel-tourism-ui/`:
```bash
npm run typecheck
```
Expected: no errors. Fix any `objectId` prop mismatch in `SectionMedia.tsx`.

- [ ] **Step 6: Run the modal test, observe pass**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run -- src/features/object-editor/widgets/MediaEditModal.test.tsx
```
Expected: existing tests still pass + new test passes.

- [ ] **Step 7: Commit**

```bash
git add bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.tsx bertel-tourism-ui/src/features/object-editor/widgets/MediaEditModal.test.tsx bertel-tourism-ui/src/features/object-editor/sections/SectionMedia.tsx
git commit -m "feat(editor): wire MediaUploadField into MediaEditModal"
```

---

## Task 13 — Update DPIA: mark EXIF action as delivered

**Files:**
- Modify: `bertel-tourism-ui/public/legal/dpia.md`
- Modify: `bertel-tourism-ui/public/legal/dpia.html`
- Modify: `bertel-tourism-ui/public/legal/dpia.pdf` (regenerated)
- Modify: `bertel-tourism-ui/public/legal/rgpd.pdf` (regenerated alongside)

- [ ] **Step 1: Update dpia.md technical-measures table**

In `bertel-tourism-ui/public/legal/dpia.md` §5.1, replace the line:
```
| Métadonnées EXIF des médias | Neutralisation automatique des EXIF (GPS, appareil, date) avant publication via API publique | 🔴 Non systématisé — à industrialiser (action prioritaire) |
```
with:
```
| Métadonnées EXIF des médias | Neutralisation automatique des EXIF (GPS, appareil, date) avant publication via API publique — pipeline `/api/media/upload` (resize ≤ 2000 px + strip métadonnées via sharp) | ✅ En place pour les nouveaux uploads ; backfill des médias antérieurs à planifier |
```

- [ ] **Step 2: Update dpia.md §7.1 action #1**

In `bertel-tourism-ui/public/legal/dpia.md` §7.1, replace action #1:
```
| 1 | **Neutraliser automatiquement les métadonnées EXIF** des médias publiés via API publique (GPS, appareil, date), sauf exceptions explicitement nécessaires et documentées | T2 2026 | Équipe SI |
```
with:
```
| 1 | ✅ **Livré — Neutralisation automatique des métadonnées EXIF** des nouveaux uploads via `/api/media/upload` (sharp, strip EXIF/IPTC/XMP + resize ≤ 2000 px). Reste à planifier : backfill des médias antérieurs. | Livré T2 2026 · Backfill : T4 2026 | Équipe SI |
```

- [ ] **Step 3: Apply the same two updates to dpia.html**

Mirror both changes in `bertel-tourism-ui/public/legal/dpia.html`. The table cells are HTML so wrap the bold marker in `<strong>` as already used elsewhere.

- [ ] **Step 4: Regenerate PDFs**

Run from `bertel-tourism-ui/`:
```bash
PLAYWRIGHT_BROWSERS_PATH="$(pwd)/.playwright-browsers" node public/legal/_build_pdf.mjs
```
Expected: `✓ rgpd.pdf` and `✓ dpia.pdf`. Both PDFs are updated on disk.

- [ ] **Step 5: Commit**

```bash
git add bertel-tourism-ui/public/legal/dpia.md bertel-tourism-ui/public/legal/dpia.html bertel-tourism-ui/public/legal/dpia.pdf bertel-tourism-ui/public/legal/rgpd.pdf
git commit -m "docs(dpia): mark EXIF stripping action as delivered for new uploads"
```

---

## Task 14 — Final verification

**Files:** none

- [ ] **Step 1: Run the full test suite**

Run from `bertel-tourism-ui/`:
```bash
npm run test:run
```
Expected: all existing tests + new tests pass.

- [ ] **Step 2: Typecheck**

Run from `bertel-tourism-ui/`:
```bash
npm run typecheck
```
Expected: no errors.

- [ ] **Step 3: Build**

Run from `bertel-tourism-ui/`:
```bash
npm run build
```
Expected: build succeeds, including the new `/api/media/upload` route compiled as a server function.

- [ ] **Step 4: Manual end-to-end check (recommended)**

With a Supabase project that has the `media` bucket applied (Task 1) and `SUPABASE_SERVICE_ROLE_KEY` set:

1. `npm run dev`
2. Sign in to the editor
3. Open any object's edit page → Section Médias → Ajouter un média → choose a large JPG with GPS in EXIF (e.g. an iPhone shot)
4. Upload completes; the URL field shows a `media/` bucket URL
5. Download the resulting file from that URL and run `exiftool` — `GPSLatitude`, `Make`, `DateTimeOriginal` must all be absent
6. Inspect dimensions — neither `width` nor `height` exceeds 2000 px

- [ ] **Step 5: Push the branch and open a PR (if applicable)**

```bash
git push -u origin HEAD
gh pr create --title "feat(media): user uploads with resize ≤ 2000 px + EXIF strip" --body "$(cat <<'EOF'
## Summary
- Adds POST /api/media/upload — Next.js Route Handler resizes images to fit 2000×2000 and strips EXIF/IPTC/XMP via sharp before storing them in a new public `media` Supabase Storage bucket.
- New `MediaUploadField` widget in the object editor; replaces manual URL paste with a real file picker.
- Service-role key gates writes to the bucket so the public API can never serve un-processed bytes.
- DPIA action #1 marked as delivered (new uploads); backfill of legacy media tracked as a follow-up.

## Test plan
- [ ] `npm run test:run` (jest)
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] Manual upload of an iPhone JPG with GPS → exiftool shows no EXIF
- [ ] Manual upload of a 4000×3000 image → response shows width/height ≤ 2000

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Self-review notes (kept after writing the plan)

- **Spec coverage:** (a) upload UI → Tasks 11-12; (b) max 2000 px → Tasks 5 + 7; (c) EXIF strip → relies on sharp ≥0.33 default-strip behaviour, documented by a load-bearing block comment in `process-image.ts` and verified by the EXIF assertion test in Task 6 (sharp's `.withMetadata({})` opts INTO keeping metadata in 0.34 — verified empirically and via `node_modules/sharp/lib/output.js`); (d) "avant publication via API publique" → guaranteed by the bucket RLS that blocks non-service-role writes (Task 1) combined with the route handler being the only writer (Task 9). DPIA documentation updated in Task 13.
- **Type consistency:** `UploadedMedia` is used in `media-upload.ts`, `MediaUploadField.tsx`, and informally in `MediaEditModal.tsx`. The `StorageUploader` interface is shared between `handle-upload.ts` (definition) and `route.ts` (implementation). `MediaProcessingError.code` discriminator (`'mime' | 'size' | 'decode'`) is referenced both in `process-image.test.ts` (assertions) and `route.ts` (status mapping).
- **No placeholders:** every step contains either runnable commands or complete code blocks. The one "verify by reading editor state" step in Task 12 includes a grep command to do the verification.
- **Open follow-ups (not in scope of this plan):**
  - Backfill: a job that downloads existing `media.url` entries, runs them through `processImage`, re-uploads, and updates the URL. Tracked in DPIA §7.1 as a separate item ("Backfill T4 2026").
  - Video EXIF stripping: deferred — `ffmpeg`-based pipeline, separate plan.
  - Client-side preflight resize: optional UX improvement (saves upload bandwidth). Skipped here because the server-side guarantee is what the DPIA requires; preflight is nice-to-have.
