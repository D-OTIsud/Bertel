import busboy from 'busboy';

/**
 * API-01: bounded reading of Web Request bodies for Node App Router routes.
 *
 * `Content-Length` can reject a request EARLY (cheap win) but never proves compliance — it is
 * client-supplied and can be absent or lying (chunked transfer, a false small value, or an
 * intermediary rewriting it). The only trustworthy bound is counting octets as they arrive from
 * `request.body.getReader()` and refusing BEFORE retaining a chunk that would cross the limit.
 *
 * `maxBytes` bounds the INPUT byte count read off the wire — it is not a promise about total
 * process memory. Downstream parsing (`Buffer` copies while coalescing, `Request.formData()`
 * re-parsing the bytes, `JSON.parse` materializing strings/objects) allocates additional copies
 * proportional to the accepted size, so peak memory for an accepted request is a small constant
 * multiple of `maxBytes`, not `maxBytes` itself. The bound's job is to make that multiple finite
 * and attacker-independent, not to cap memory at exactly `maxBytes`.
 */

export const REQUEST_BODY_TOO_LARGE = 'request_body_too_large';

export class BodyTooLargeError extends Error {
  readonly code = REQUEST_BODY_TOO_LARGE;
  constructor(public readonly limitBytes: number) {
    super(`Le corps de la requête dépasse la limite autorisée (${limitBytes} octets).`);
    this.name = 'BodyTooLargeError';
  }
}

const INITIAL_BUFFER_CAPACITY = 64 * 1024;

/**
 * A single growing buffer (geometric growth, capped at `maxBytes`) instead of an array of
 * fragments `Buffer.concat`-ed at the end — avoids both a per-chunk allocation for a stream
 * delivered in many tiny pieces and a doubled peak (fragment array + concat copy) for a stream
 * delivered in one large piece. Starts small (64 KiB) regardless of `maxBytes`, so a tiny input
 * against a large ceiling (e.g. the 100 MiB video envelope) never eagerly allocates that ceiling.
 * Shared by `readBoundedBytes` and the multipart file collector in `readBoundedFormData`.
 */
class BoundedByteSink {
  private buf: Buffer;
  private total = 0;
  constructor(private readonly maxBytes: number) {
    this.buf = Buffer.alloc(Math.min(maxBytes, INITIAL_BUFFER_CAPACITY));
  }
  get length(): number {
    return this.total;
  }
  /** Returns false (without retaining `chunk`) if appending it would cross `maxBytes`. */
  push(chunk: Buffer): boolean {
    const next = this.total + chunk.length;
    if (next > this.maxBytes) return false;
    if (next > this.buf.length) {
      const grown = Buffer.alloc(Math.min(this.maxBytes, Math.max(next, this.buf.length * 2)));
      this.buf.copy(grown, 0, 0, this.total);
      this.buf = grown;
    }
    chunk.copy(this.buf, this.total);
    this.total = next;
    return true;
  }
  toBuffer(): Buffer {
    return this.buf.subarray(0, this.total);
  }
}

/**
 * Read a Request/Response body up to `maxBytes`. Throws `BodyTooLargeError` and cancels the
 * reader (never retains the chunk that pushes the total over the limit) if exceeded. Never
 * clones or tees the input stream.
 */
export async function readBoundedBytes(req: Request, maxBytes: number): Promise<Buffer> {
  const declared = req.headers.get('content-length');
  if (declared !== null) {
    const declaredLen = Number(declared);
    // A conforming, honest Content-Length lets us reject before touching the stream at all.
    if (Number.isFinite(declaredLen) && declaredLen > maxBytes) {
      throw new BodyTooLargeError(maxBytes);
    }
  }
  if (!req.body) return Buffer.alloc(0);

  const reader = req.body.getReader();
  const sink = new BoundedByteSink(maxBytes);
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value || value.byteLength === 0) continue;
      const chunk = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
      if (!sink.push(chunk)) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError(maxBytes);
      }
    }
  } finally {
    reader.releaseLock();
  }
  return sink.toBuffer();
}

// Native `Request.formData()` materializes EVERY part (field/file) into JS objects before any
// application code runs — a 1.26 MiB body with 10 000 tiny file parts creates 10 000 File/Blob
// objects before `assertFormDataShape` ever gets to reject the duplicate/excess ones. Busboy
// streams the multipart body and enforces these counts DURING parsing, so a pathological part
// count is refused before more than `files`+`fields` objects are ever allocated. These are
// process-wide ceilings (not per-route configurable) — routes still call `assertFormDataShape`
// afterwards for their OWN field-name contract (e.g. rejecting an unknown field name).
const MAX_FORM_FILES = 1;
const MAX_FORM_FIELDS = 8;
const MAX_FORM_PARTS = MAX_FORM_FILES + MAX_FORM_FIELDS;
const MAX_FORM_FIELD_VALUE_BYTES = 16 * 1024; // generous for a title/text field, not for a payload
const MAX_FORM_FIELD_NAME_BYTES = 100;

/**
 * Bounded multipart parse: reads at most `maxBytes` of raw bytes (readBoundedBytes, unchanged),
 * then feeds that already-bounded buffer to a streaming Busboy parser — never to Node's own
 * `Request.formData()`, which would buffer/allocate every part up front. At most one file part
 * and `MAX_FORM_FIELDS` field parts are ever appended to the returned FormData; any additional
 * part, oversized field, or truncated name/value/file aborts parsing and rejects instead of
 * silently truncating (a caller must never see a "clean" FormData that hides a shape violation
 * busboy already discarded internally).
 */
export async function readBoundedFormData(req: Request, maxBytes: number): Promise<FormData> {
  const bytes = await readBoundedBytes(req, maxBytes);
  const contentType = req.headers.get('content-type') ?? '';
  return parseBoundedMultipart(bytes, contentType, maxBytes);
}

function parseBoundedMultipart(bytes: Buffer, contentType: string, maxBytes: number): Promise<FormData> {
  return new Promise<FormData>((resolve, reject) => {
    let bb: ReturnType<typeof busboy>;
    try {
      bb = busboy({
        headers: { 'content-type': contentType },
        defParamCharset: 'utf8',
        limits: {
          files: MAX_FORM_FILES,
          fields: MAX_FORM_FIELDS,
          parts: MAX_FORM_PARTS,
          fieldSize: MAX_FORM_FIELD_VALUE_BYTES,
          fieldNameSize: MAX_FORM_FIELD_NAME_BYTES,
          fileSize: maxBytes, // belt-and-suspenders — the raw bound already caps this
        },
      });
    } catch {
      reject(new FormDataShapeError('malformed multipart headers'));
      return;
    }

    const form = new FormData();
    let settled = false;
    let violation: string | null = null;

    const settleOnce = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const fail = (err: Error) => settleOnce(() => {
      bb.destroy();
      reject(err);
    });
    const markViolation = (reason: string) => {
      if (!violation) violation = reason;
    };

    bb.on('field', (name, value, info) => {
      if (info.nameTruncated || info.valueTruncated) {
        markViolation('field_truncated');
        return;
      }
      form.append(name, value);
    });

    bb.on('file', (name, stream, info) => {
      const sink = new BoundedByteSink(maxBytes);
      let truncated = false;
      stream.on('data', (chunk: Buffer) => {
        if (truncated) return;
        if (!sink.push(chunk)) {
          truncated = true;
          markViolation('file_too_large');
          stream.resume(); // drain without retaining further bytes, avoid backpressure deadlock
        }
      });
      stream.on('limit', () => {
        truncated = true;
        markViolation('file_truncated');
      });
      stream.on('close', () => {
        if (truncated) return;
        // The sink supplies one contiguous view; File takes a bounded copy of its bytes.
        form.append(name, new File([sink.toBuffer()], info.filename ?? '', { type: info.mimeType }));
      });
      stream.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
    });

    bb.on('filesLimit', () => markViolation('too_many_files'));
    bb.on('fieldsLimit', () => markViolation('too_many_fields'));
    bb.on('partsLimit', () => markViolation('too_many_parts'));
    bb.on('error', (err) => fail(err instanceof Error ? err : new Error(String(err))));
    bb.on('close', () => settleOnce(() => {
      if (violation) {
        reject(new FormDataShapeError(violation));
        return;
      }
      resolve(form);
    }));

    bb.end(bytes);
  });
}

/**
 * Bounded JSON parse: reads at most `maxBytes` of raw bytes, then `JSON.parse`s the decoded
 * text. Malformed JSON under the bound still throws a plain `SyntaxError` — routes keep their
 * existing 400 handling for that; only the size bound is new here.
 */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const bytes = await readBoundedBytes(req, maxBytes);
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  return JSON.parse(text);
}

export class FormDataShapeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormDataShapeError';
  }
}

export interface FormDataShapeLimits {
  /** Field names this route actually reads — anything else is rejected. */
  allowedFields: readonly string[];
  /** Max entries per field name (default 1) — rejects duplicate `file` parts etc. */
  maxValuesPerField?: number;
}

/**
 * Bytes-envelope + max-file-size bounds don't stop a caller from padding a multipart body with
 * many small fields, or several `file` parts under one field name, all within the byte ceiling —
 * the parser still has to allocate/decode every part even though the route only ever reads the
 * first `file`/named fields. Reject that shape explicitly, against the route's OWN declared
 * field contract, before any of those values are used.
 */
export function assertFormDataShape(form: FormData, limits: FormDataShapeLimits): void {
  const allowed = new Set(limits.allowedFields);
  const maxValues = limits.maxValuesPerField ?? 1;
  const counts = new Map<string, number>();
  for (const key of form.keys()) {
    if (!allowed.has(key)) {
      throw new FormDataShapeError(`unexpected field: ${key}`);
    }
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const [key, count] of counts) {
    if (count > maxValues) {
      throw new FormDataShapeError(`duplicate field: ${key}`);
    }
  }
}

export type SemaphoreGroup = 'upload' | 'ai';

// Per-PROCESS ceilings on concurrently in-flight expensive requests (sharp decode/encode for
// uploads, provider calls for AI extraction). This bounds memory/CPU blast radius on a single
// Node instance but does NOT coordinate across replicas: each process instance enforces its own
// counter independently, so horizontal scaling multiplies the effective global ceiling
// (N replicas ⇒ up to N × limit concurrent expensive requests cluster-wide). A real fix needs a
// distributed quota (e.g. Redis-backed lease) — out of scope for this change.
const SEMAPHORE_LIMITS: Record<SemaphoreGroup, number> = { upload: 2, ai: 1 };

interface SemaphoreState {
  active: Record<SemaphoreGroup, number>;
}

// Next.js can load this module more than once per process (distinct route bundles are compiled
// as separate module instances) — a plain module-scope counter would then give each bundle its
// OWN counter, silently multiplying the effective ceiling. Stash the counters on `globalThis`
// under a namespaced `Symbol.for` key so every module instance in the SAME process shares one
// state object; this is still purely per-process (no distributed claim, see limitation above).
const SEMAPHORE_STATE_KEY = Symbol.for('bertel.request-body.semaphore-state.v1');

type GlobalWithSemaphoreState = typeof globalThis & { [key: symbol]: SemaphoreState | undefined };

function getSemaphoreState(): SemaphoreState {
  const g = globalThis as GlobalWithSemaphoreState;
  const existing = g[SEMAPHORE_STATE_KEY];
  if (existing) return existing;
  const created: SemaphoreState = { active: { upload: 0, ai: 0 } };
  g[SEMAPHORE_STATE_KEY] = created;
  return created;
}

export const SEMAPHORE_RETRY_AFTER_SECONDS = 2;

export interface SemaphoreLease {
  release(): void;
}

/** Acquire a lease for `group`, or `null` if the process-local ceiling is already reached. */
export function acquireLease(group: SemaphoreGroup): SemaphoreLease | null {
  const state = getSemaphoreState();
  if (state.active[group] >= SEMAPHORE_LIMITS[group]) return null;
  state.active[group] += 1;
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      state.active[group] = Math.max(0, state.active[group] - 1);
    },
  };
}
