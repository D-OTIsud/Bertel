/** @jest-environment node */
import {
  readBoundedBytes,
  readBoundedFormData,
  readBoundedJson,
  BodyTooLargeError,
  acquireLease,
  assertFormDataShape,
  FormDataShapeError,
} from './request-body.server';

/**
 * A plain duck-typed stand-in for `Request` — NOT `new Request(...)`. Constructing a real
 * `Request` around a `ReadableStream` body makes Node's own fetch implementation start
 * consuming/piping that stream as part of body extraction, independently of and ahead of
 * whatever our code later does with `req.body.getReader()` — that auto-prefetch desynchronizes
 * `cancelled`/`pullCount` assertions from what `readBoundedBytes` itself actually does. Our
 * functions only ever touch `req.headers` and `req.body`, so a plain object with those two
 * properties is a faithful, fully-controlled test double; the pull is invoked ONLY in direct
 * response to our code's own `reader.read()` calls (see `highWaterMark: 0` below).
 */
function makeStreamedRequest(
  chunks: Uint8Array[],
  headers: Record<string, string> = {},
): { req: Request; getCancelled: () => boolean; getPullCount: () => number } {
  let cancelled = false;
  let pullCount = 0;
  let i = 0;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        pullCount += 1;
        if (i < chunks.length) {
          controller.enqueue(chunks[i]);
          i += 1;
        } else {
          controller.close();
        }
      },
      cancel() {
        cancelled = true;
      },
    },
    // highWaterMark: 0 ⇒ no automatic prefetch on stream creation; `pull` fires lazily, only to
    // satisfy an outstanding `reader.read()` — the read/cancel timing our assertions rely on.
    { highWaterMark: 0 },
  );
  const req = { headers: new Headers(headers), body: stream } as unknown as Request;
  return { req, getCancelled: () => cancelled, getPullCount: () => pullCount };
}

const bytes = (n: number, fill = 65): Uint8Array => new Uint8Array(n).fill(fill);

describe('readBoundedBytes', () => {
  it('accepts a body at exactly the limit', async () => {
    const { req } = makeStreamedRequest([bytes(10)]);
    const out = await readBoundedBytes(req, 10);
    expect(out.byteLength).toBe(10);
  });

  it('refuses a body one byte over the limit (single big chunk)', async () => {
    const { req, getCancelled } = makeStreamedRequest([bytes(11)]);
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(getCancelled()).toBe(true);
  });

  it('bounds correctly across several small chunks', async () => {
    const { req } = makeStreamedRequest([bytes(4), bytes(4), bytes(2)]);
    const out = await readBoundedBytes(req, 10);
    expect(out.byteLength).toBe(10);
  });

  it('refuses when several chunks together exceed the limit', async () => {
    const { req, getCancelled } = makeStreamedRequest([bytes(4), bytes(4), bytes(4)]);
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    expect(getCancelled()).toBe(true);
  });

  it('with no Content-Length header still enforces the bound from the stream', async () => {
    const { req } = makeStreamedRequest([bytes(20)]);
    expect(req.headers.get('content-length')).toBeNull();
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('with a lying (too-small) Content-Length still enforces the real byte count', async () => {
    const { req } = makeStreamedRequest([bytes(20)], { 'content-length': '1' });
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('rejects early from a too-large Content-Length header alone', async () => {
    const { req, getCancelled, getPullCount } = makeStreamedRequest([bytes(5)], { 'content-length': '999' });
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    // Early Content-Length rejection short-circuits before touching the stream at all: no
    // reader is ever acquired, so `pull` (which only fires in response to a `read()` call given
    // `highWaterMark: 0`) never runs either.
    expect(getPullCount()).toBe(0);
    expect(getCancelled()).toBe(false);
  });

  it('stops reading further chunks once an oversized chunk is seen (no Content-Length)', async () => {
    const { req, getPullCount } = makeStreamedRequest([bytes(4), bytes(4), bytes(4), bytes(4)]);
    await expect(readBoundedBytes(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
    // 3 chunks (4+4+4=12>10) is enough to detect the overflow; the 4th is never pulled.
    expect(getPullCount()).toBe(3);
  });

  it('assembles many tiny fragments correctly (small-fragment coalescing)', async () => {
    const fragments = Array.from({ length: 50 }, (_, n) => new Uint8Array([n]));
    const { req } = makeStreamedRequest(fragments);
    const out = await readBoundedBytes(req, 50);
    expect(out.byteLength).toBe(50);
    expect(Array.from(out)).toEqual(Array.from({ length: 50 }, (_, n) => n));
  });
});

/**
 * Hand-rolled multipart/form-data writer — gives full control over the boundary string and raw
 * bytes (quoting, truncation, part count) that a real `FormData`/`Request` serialization would
 * hide from us. ASCII-only field/file names by design: header-value charset handling is exactly
 * what a mainstream multipart client (undici) already gets right, so the UTF-8 filename fidelity
 * test below goes through a REAL `FormData`/`Request` instead of guessing at raw header bytes.
 */
function buildMultipart(
  boundary: string,
  parts: Array<
    | { kind: 'field'; name: string; value: string }
    | { kind: 'file'; name: string; filename: string; contentType: string; data: Buffer }
  >,
): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    chunks.push(Buffer.from(`--${boundary}\r\n`));
    if (part.kind === 'field') {
      chunks.push(Buffer.from(`Content-Disposition: form-data; name="${part.name}"\r\n\r\n`));
      chunks.push(Buffer.from(part.value, 'utf8'));
      chunks.push(Buffer.from('\r\n'));
    } else {
      chunks.push(
        Buffer.from(
          `Content-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\n` +
            `Content-Type: ${part.contentType}\r\n\r\n`,
        ),
      );
      chunks.push(part.data);
      chunks.push(Buffer.from('\r\n'));
    }
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  return Buffer.concat(chunks);
}

describe('readBoundedFormData', () => {
  it('parses a real multipart body intact: UTF-8 filename, binary octets, and a title field', async () => {
    const form = new FormData();
    form.append('object_id', 'HOTRUN9999990711');
    form.append('title', 'Café — carte du jour');
    form.append('file', new File([new Uint8Array([1, 2, 3, 4, 0, 255])], 'café menu 😀.jpg', { type: 'image/jpeg' }));
    const probe = new Request('http://internal.invalid/', { method: 'POST', body: form });
    const contentType = probe.headers.get('content-type') ?? '';
    const rawBody = Buffer.from(await probe.arrayBuffer());

    const { req } = makeStreamedRequest([rawBody], { 'content-type': contentType });
    const parsed = await readBoundedFormData(req, 1024 * 1024);
    expect(parsed.get('object_id')).toBe('HOTRUN9999990711');
    expect(parsed.get('title')).toBe('Café — carte du jour');
    const file = parsed.get('file');
    expect(file).toBeInstanceOf(File);
    expect((file as File).type).toBe('image/jpeg');
    expect((file as File).name).toBe('café menu 😀.jpg');
    expect(Buffer.from(await (file as File).arrayBuffer())).toEqual(Buffer.from([1, 2, 3, 4, 0, 255]));
  });

  it('rejects an oversized multipart body without building the FormData', async () => {
    const form = new FormData();
    form.append('file', new File([bytes(50)], 'x.jpg', { type: 'image/jpeg' }));
    const probe = new Request('http://internal.invalid/', { method: 'POST', body: form });
    const contentType = probe.headers.get('content-type') ?? '';
    const rawBody = Buffer.from(await probe.arrayBuffer());

    const { req } = makeStreamedRequest([rawBody], { 'content-type': contentType });
    await expect(readBoundedFormData(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });

  it('accepts a quoted boundary parameter', async () => {
    const boundary = 'AaB03x';
    const raw = buildMultipart(boundary, [{ kind: 'field', name: 'title', value: 'ok' }]);
    const { req } = makeStreamedRequest([raw], { 'content-type': `multipart/form-data; boundary="${boundary}"` });
    const parsed = await readBoundedFormData(req, 1024 * 1024);
    expect(parsed.get('title')).toBe('ok');
  });

  it('rejects a malformed Content-Type (no boundary parameter) instead of hanging', async () => {
    const raw = buildMultipart('AaB03x', [{ kind: 'field', name: 'title', value: 'ok' }]);
    const { req } = makeStreamedRequest([raw], { 'content-type': 'multipart/form-data' });
    await expect(readBoundedFormData(req, 1024 * 1024)).rejects.toBeInstanceOf(FormDataShapeError);
  });

  it('rejects a truncated body (stream ends with no closing boundary at all) instead of hanging or resolving partial data', async () => {
    const boundary = 'AaB03x';
    // Deliberately NO trailing boundary/CRLF whatsoever after the field's value — the stream
    // ends mid-scan for the next boundary, which a spec-compliant parser must treat as an error
    // (not silently resolve whatever it managed to buffer so far).
    const truncated = Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="title"\r\n\r\nok`);
    const { req } = makeStreamedRequest([truncated], { 'content-type': `multipart/form-data; boundary=${boundary}` });
    await expect(readBoundedFormData(req, 1024 * 1024)).rejects.toBeInstanceOf(Error);
  });

  it('rejects a second file part before materializing it (files limit enforced during parsing)', async () => {
    const boundary = 'AaB03x';
    const raw = buildMultipart(boundary, [
      { kind: 'file', name: 'file', filename: 'a.jpg', contentType: 'image/jpeg', data: Buffer.from([1, 2, 3]) },
      { kind: 'file', name: 'file', filename: 'b.jpg', contentType: 'image/jpeg', data: Buffer.from([4, 5, 6]) },
    ]);
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    try {
      const { req } = makeStreamedRequest([raw], { 'content-type': `multipart/form-data; boundary=${boundary}` });
      await expect(readBoundedFormData(req, 1024 * 1024)).rejects.toBeInstanceOf(FormDataShapeError);
      const filesAppended = appendSpy.mock.calls.filter((call) => call[1] instanceof File);
      expect(filesAppended.length).toBeLessThanOrEqual(1); // the second file is never materialized
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('rejects 10 000 tiny file parts without materializing more than one File object (bounded allocation)', async () => {
    const boundary = 'AaB03x';
    const parts = Array.from({ length: 10_000 }, (_, n) => ({
      kind: 'file' as const,
      name: 'file',
      filename: `f${n}.txt`,
      contentType: 'text/plain',
      data: Buffer.from([n % 256]),
    }));
    const raw = buildMultipart(boundary, parts); // ~1.2 MB total, well under the raw envelope
    const appendSpy = jest.spyOn(FormData.prototype, 'append');
    try {
      const { req } = makeStreamedRequest([raw], { 'content-type': `multipart/form-data; boundary=${boundary}` });
      await expect(readBoundedFormData(req, 2 * 1024 * 1024)).rejects.toBeInstanceOf(FormDataShapeError);
      const filesAppended = appendSpy.mock.calls.filter((call) => call[1] instanceof File);
      expect(filesAppended.length).toBeLessThanOrEqual(1); // NOT 10 000 File objects allocated
    } finally {
      appendSpy.mockRestore();
    }
  });

  it('rejects a 9th field (fields limit enforced during parsing, not after)', async () => {
    const boundary = 'AaB03x';
    const parts = Array.from({ length: 9 }, (_, n) => ({ kind: 'field' as const, name: `f${n}`, value: 'x' }));
    const raw = buildMultipart(boundary, parts);
    const { req } = makeStreamedRequest([raw], { 'content-type': `multipart/form-data; boundary=${boundary}` });
    await expect(readBoundedFormData(req, 1024 * 1024)).rejects.toBeInstanceOf(FormDataShapeError);
  });

  it('rejects a field value truncated at the 16 KiB generous cap', async () => {
    const boundary = 'AaB03x';
    const raw = buildMultipart(boundary, [{ kind: 'field', name: 'title', value: 'x'.repeat(17 * 1024) }]);
    const { req } = makeStreamedRequest([raw], { 'content-type': `multipart/form-data; boundary=${boundary}` });
    await expect(readBoundedFormData(req, 1024 * 1024)).rejects.toBeInstanceOf(FormDataShapeError);
  });
});

describe('readBoundedJson', () => {
  it('parses well-formed JSON under the bound', async () => {
    const { req } = makeStreamedRequest([Buffer.from(JSON.stringify({ a: 1 }))]);
    await expect(readBoundedJson(req, 1024)).resolves.toEqual({ a: 1 });
  });

  it('throws a plain SyntaxError for malformed JSON under the bound (existing 400 semantics)', async () => {
    const { req } = makeStreamedRequest([Buffer.from('{not json')]);
    await expect(readBoundedJson(req, 1024)).rejects.toBeInstanceOf(SyntaxError);
  });

  it('rejects oversized JSON before attempting to parse it', async () => {
    const { req } = makeStreamedRequest([Buffer.from(JSON.stringify({ a: 'x'.repeat(100) }))]);
    await expect(readBoundedJson(req, 10)).rejects.toBeInstanceOf(BodyTooLargeError);
  });
});

describe('assertFormDataShape', () => {
  it('accepts a form matching the declared field contract', () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1])], 'a.jpg'));
    form.append('object_id', 'HOTRUN9999990711');
    expect(() => assertFormDataShape(form, { allowedFields: ['file', 'object_id'] })).not.toThrow();
  });

  it('rejects an unexpected field', () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1])], 'a.jpg'));
    form.append('sneaky', 'x');
    expect(() => assertFormDataShape(form, { allowedFields: ['file'] })).toThrow(FormDataShapeError);
  });

  it('rejects a duplicate file entry under the same field name', () => {
    const form = new FormData();
    form.append('file', new File([new Uint8Array([1])], 'a.jpg'));
    form.append('file', new File([new Uint8Array([2])], 'b.jpg'));
    expect(() => assertFormDataShape(form, { allowedFields: ['file'] })).toThrow(FormDataShapeError);
  });
});

describe('acquireLease', () => {
  it('rejects once the group ceiling is reached and releases free a slot', () => {
    const l1 = acquireLease('upload');
    const l2 = acquireLease('upload');
    expect(l1).not.toBeNull();
    expect(l2).not.toBeNull();
    expect(acquireLease('upload')).toBeNull(); // ceiling is 2
    l1!.release();
    expect(acquireLease('upload')).not.toBeNull();
    l2!.release();
    acquireLease('upload')!.release();
  });

  it('keeps separate counters per group', () => {
    const upload = acquireLease('upload');
    const ai1 = acquireLease('ai');
    expect(ai1).not.toBeNull();
    expect(acquireLease('ai')).toBeNull(); // ceiling is 1
    upload!.release();
    ai1!.release();
  });

  it('release() is idempotent', () => {
    const lease = acquireLease('ai');
    lease!.release();
    lease!.release();
    const again = acquireLease('ai');
    expect(again).not.toBeNull();
    again!.release();
  });

  it('shares its ceiling across distinct module instances (duplicate route bundle scenario)', () => {
    // Next.js can load this module more than once per process (one instance per route bundle).
    // A plain module-scope counter would give each instance its OWN counter — silently doubling
    // the effective ceiling. Force two genuinely separate instances via resetModules() and prove
    // acquiring from one is visible to the other, i.e. the globalThis-backed state is shared.
    jest.resetModules();
    const modA = jest.requireActual('./request-body.server') as typeof import('./request-body.server');
    jest.resetModules();
    const modB = jest.requireActual('./request-body.server') as typeof import('./request-body.server');
    expect(modA.acquireLease).not.toBe(modB.acquireLease); // genuinely distinct module instances

    const l1 = modA.acquireLease('ai');
    expect(l1).not.toBeNull();
    // Ceiling for 'ai' is 1 — the OTHER module instance must see it as already taken.
    expect(modB.acquireLease('ai')).toBeNull();
    l1!.release();
    const l2 = modB.acquireLease('ai');
    expect(l2).not.toBeNull();
    l2!.release();
  });
});
