/** @jest-environment node */
import type { NextRequest } from 'next/server';
import { POST as translate } from '@/app/api/ai/translate/route';
import { POST as extract } from '@/app/api/menu/extract/route';
import { acquireLease } from './request-body.server';

const UID = '4b84b8f0-2752-4d17-b2d9-000000000003';
const ALLOWED = { data: { allowed: true, remaining: 11, retry_after: 0 }, error: null };
const mockQuota = jest.fn((_signal: AbortSignal): Promise<{ data: unknown; error: unknown }> => Promise.resolve(ALLOWED));
const mockRpc = jest.fn((_name: string, _args: unknown) => ({ abortSignal: (signal: AbortSignal) => mockQuota(signal) }));
const mockTranslate = jest.fn(async () => ({ description: 'Synthetic translation' }));
const mockExtract = jest.fn(async () => ({ ok: true, menu: { items: [] }, suggestedDietaryByDish: [] }));
const mockPrepare = jest.fn(async () => ({ mime: 'image/jpeg', base64: 'AAA' }));
const mockProvider = jest.fn(async () => ({ config: { apiKind: 'openai_compatible', baseUrl: 'https://synthetic.invalid', model: 'synthetic', maxOutputTokens: 256, extra: {} }, apiKey: 'synthetic-not-real' }));
jest.mock('server-only', () => ({}));
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: () => ({
  auth: { getUser: async () => ({ data: { user: { id: UID } }, error: null }) }, schema: () => ({ rpc: mockRpc }),
}) }));
jest.mock('@/lib/supabase-caller.server', () => ({ createCallerClient: () => ({ schema: () => ({ rpc: async () => ({ data: true, error: null }) }) }) }));
jest.mock('@/lib/ai-provider.server', () => ({ resolveActiveAiProvider: () => mockProvider() }));
jest.mock('@/app/api/ai/translate/translation', () => ({ ...jest.requireActual('@/app/api/ai/translate/translation'), translateFields: () => mockTranslate() }));
jest.mock('@/app/api/menu/extract/media-prep', () => ({ MAX_VISION_IMAGES: 8, prepareVisionImage: () => mockPrepare() }));
jest.mock('@/app/api/menu/extract/orchestrate', () => ({ orchestrateExtraction: () => mockExtract() }));

const routes = [
  { name: 'translate', handler: translate, body: { objectId: 'HOTRUN0000000001', sourceLanguage: 'fr', targetLanguage: 'en', fields: { description: 'Synthetic text' } } },
  { name: 'menu_extract', handler: extract, body: { object_id: 'HOTRUN0000000001', images: [{ mime: 'image/jpeg', base64: 'AAA' }] } },
] as const;
function request(body: unknown, signal?: AbortSignal) {
  return new Request('https://synthetic.invalid/api/ai', { method: 'POST', signal,
    headers: { authorization: 'Bearer synthetic-token', 'content-type': 'application/json' }, body: JSON.stringify(body),
  }) as NextRequest;
}
beforeEach(() => {
  jest.clearAllMocks();
  mockQuota.mockReset().mockResolvedValue(ALLOWED);
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-not-real';
});
afterEach(() => { jest.useRealTimers(); });

it.each(routes)('$name authorizes the actual verified identity and preserves a legitimate paid-effect path', async ({ name, handler, body }) => {
  expect((await handler(request(body))).status).toBe(200);
  expect(mockRpc).toHaveBeenCalledWith('admit_ai_request', { p_user_id: UID, p_route: name });
  expect(mockTranslate.mock.calls.length + mockExtract.mock.calls.length).toBe(1);
});

it.each(routes)('$name never takes the quota identity, route or limit from the request body', async ({ name, handler, body }) => {
  const result = await handler(request({ ...body, userId: 'untrusted-other-user', route: 'untrusted-route', limit: 999 }));
  // Translation already rejects unknown fields; extraction already strips them.
  expect(result.status).toBe(name === 'translate' ? 400 : 200);
  expect(mockRpc).toHaveBeenCalledWith('admit_ai_request', { p_user_id: UID, p_route: name });
  expect(mockTranslate.mock.calls.length + mockExtract.mock.calls.length).toBe(name === 'translate' ? 0 : 1);
});

it.each(routes)('$name refuses the shared verdict before provider lookup, image processing or paid effects', async ({ handler, body }) => {
  mockQuota.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after: 23 }, error: null });
  const result = await handler(request(body));
  expect(result.status).toBe(429);
  expect(result.headers.get('Retry-After')).toBe('23');
  expect(mockProvider).not.toHaveBeenCalled();
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockTranslate).not.toHaveBeenCalled();
  expect(mockExtract).not.toHaveBeenCalled();
});

for (const bad of [null, [], true, { allowed: true, remaining: 12, retry_after: 0 }, { allowed: false, remaining: 0, retry_after: 0 }]) {
  it.each(routes)(`$name fails closed for malformed admission ${JSON.stringify(bad)}`, async ({ handler, body }) => {
    mockQuota.mockResolvedValueOnce({ data: bad, error: null });
    const result = await handler(request(body));
    expect(result.status).toBe(503);
    expect(await result.json()).toMatchObject({ error: 'ai_admission_unavailable' });
    expect(mockProvider).not.toHaveBeenCalled();
    expect(mockPrepare).not.toHaveBeenCalled();
    expect(mockTranslate).not.toHaveBeenCalled();
    expect(mockExtract).not.toHaveBeenCalled();
  });
}

it.each(routes)('$name does not accept a positive verdict accompanied by a database error', async ({ handler, body }) => {
  mockQuota.mockResolvedValueOnce({ ...ALLOWED, error: { message: 'private-database-error' } });
  const result = await handler(request(body));
  expect(result.status).toBe(503);
  expect(await result.text()).not.toContain('private-database-error');
  expect(mockProvider).not.toHaveBeenCalled();
});

it.each(routes)('$name bounds unavailable admission and releases local work without calling the provider', async ({ handler, body }) => {
  jest.useFakeTimers();
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  mockQuota.mockImplementationOnce((signal) => new Promise((_resolve, reject) => {
    started(); signal.addEventListener('abort', () => reject(new Error('private-database-error')), { once: true });
  }));
  const pending = handler(request(body));
  await ready;
  await jest.advanceTimersByTimeAsync(5_000);
  expect((await pending).status).toBe(503);
  expect(mockProvider).not.toHaveBeenCalled();
  const lease = acquireLease('ai');
  expect(lease).not.toBeNull();
  lease?.release();
  expect((await handler(request(body))).status).toBe(200);
});

it('a late positive admission after caller abort cannot start image processing or the provider', async () => {
  let settle!: (value: typeof ALLOWED) => void;
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  mockQuota.mockImplementationOnce(() => new Promise((resolve) => { settle = resolve; started(); }));
  const caller = new AbortController();
  const pending = extract(request(routes[1].body, caller.signal));
  await ready;
  caller.abort();
  settle(ALLOWED);
  expect((await pending).status).toBe(503);
  expect(mockPrepare).not.toHaveBeenCalled();
  expect(mockProvider).not.toHaveBeenCalled();
  const lease = acquireLease('ai'); expect(lease).not.toBeNull(); lease?.release();
});

it('a new route module/worker obeys the same shared refusal instead of resetting a local allowance', async () => {
  for (let n = 0; n < 12; n++) expect((await translate(request(routes[0].body))).status).toBe(200);
  let restarted!: typeof translate;
  jest.isolateModules(() => { restarted = require('@/app/api/ai/translate/route').POST; });
  mockQuota.mockResolvedValueOnce({ data: { allowed: false, remaining: 0, retry_after: 41 }, error: null });
  const response = await restarted(request(routes[0].body));
  expect(response.status).toBe(429);
  expect(mockTranslate).toHaveBeenCalledTimes(12);
  expect(mockRpc).toHaveBeenLastCalledWith('admit_ai_request', { p_user_id: UID, p_route: 'translate' });
});
