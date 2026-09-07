/** @jest-environment node */
import type { NextRequest } from 'next/server';
import { POST } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { acquireLease } from '@/lib/request-body.server';
import { translateFields, TranslationError, MAX_TRANSLATION_BODY_BYTES } from './translation';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./translation', () => ({ ...jest.requireActual('./translation'), translateFields: jest.fn() }));

const body = { objectId: 'HOTRUN0000000001', sourceLanguage: 'fr', targetLanguage: 'en', fields: { description: 'Bienvenue' } };
const provider = { api_kind: 'openai_compatible', base_url: 'https://provider.example/v1', model: 'test-model', max_output_tokens: 4096, extra: {}, api_key: 'vault-secret' };
const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedTranslate = jest.mocked(translateFields);
let userIndex = 0;
let user: jest.Mock;
let providerRpc: jest.Mock;
let callerRpc: jest.Mock;

function req(value: unknown = body, headers: Record<string, string> = { Authorization: 'Bearer caller-token' }): NextRequest {
  return new Request('https://bertel.example/api/ai/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(value),
  }) as NextRequest;
}

describe('POST /api/ai/translate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    user = jest.fn().mockResolvedValue({ data: { user: { id: `translation-user-${++userIndex}` } }, error: null });
    providerRpc = jest.fn().mockReturnValue({ abortSignal: jest.fn().mockResolvedValue({ data: [provider], error: null }) });
    callerRpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedServer.mockReturnValue({ auth: { getUser: user }, schema: () => ({ rpc: providerRpc }) } as never);
    mockedCreate.mockReturnValue({ schema: () => ({ rpc: callerRpc }) } as never);
    mockedTranslate.mockReset().mockResolvedValue({ description: 'Welcome' });
  });

  afterEach(() => { jest.useRealTimers(); });

  it('requires a verified session before inspecting text or accessing the provider key', async () => {
    expect((await POST(req(body, {}))).status).toBe(401);
    expect(user).not.toHaveBeenCalled();
    user.mockResolvedValueOnce({ data: { user: null }, error: { message: 'invalid token' } });
    expect((await POST(req())).status).toBe(401);
    expect(providerRpc).not.toHaveBeenCalled();
  });

  it('authorizes editor rights with the caller JWT and keeps the Vault key server-side', async () => {
    const result = await POST(req());
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(await result.json()).toEqual({ translations: { description: 'Welcome' } });
    expect(user).toHaveBeenCalledWith('caller-token');
    expect(mockedCreate).toHaveBeenCalledWith('https://test.supabase.co', 'anon', expect.objectContaining({
      global: { headers: { Authorization: 'Bearer caller-token' } },
    }));
    expect(callerRpc).toHaveBeenCalledTimes(1);
    expect(callerRpc).toHaveBeenCalledWith('user_can_write_object_canonical', { p_object_id: body.objectId });
    expect(providerRpc).toHaveBeenCalledWith('get_active_ai_provider_secret');
    expect(mockedTranslate).toHaveBeenCalledWith(body, expect.objectContaining({ model: 'test-model' }), 'vault-secret', expect.any(Object));
  });

  it('allows an organization contributor with enrichment rights on that object', async () => {
    callerRpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: true, error: null });
    expect((await POST(req())).status).toBe(200);
    expect(callerRpc).toHaveBeenNthCalledWith(2, 'user_can_write_enrichment', { p_object_id: body.objectId });
    expect(callerRpc).toHaveBeenCalledTimes(2);
  });

  it('allows a portal actor only for a fiche returned by the actor-scoped RPC', async () => {
    callerRpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: [{ id: body.objectId }], error: null });
    expect((await POST(req())).status).toBe(200);
    expect(callerRpc).toHaveBeenNthCalledWith(3, 'list_my_portal_fiches', {});
  });

  it.each([
    { data: [{ id: 'HOTRUN0000000002' }], error: null },
    { data: [], error: null },
    { data: [{ id: body.objectId }], error: { code: '42501' } },
    { data: true, error: null },
  ])('denies another actor, read-only users and portal RPC failures: %p', async (portal) => {
    callerRpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce(portal);
    expect((await POST(req())).status).toBe(403);
    expect(providerRpc).not.toHaveBeenCalled();
    expect(mockedTranslate).not.toHaveBeenCalled();
  });

  it('fails closed when permission evaluation fails, even if data says true', async () => {
    callerRpc.mockResolvedValueOnce({ data: true, error: { message: 'failure' } });
    expect((await POST(req())).status).toBe(403);
    expect(callerRpc).toHaveBeenCalledTimes(1);
    expect(providerRpc).not.toHaveBeenCalled();
  });

  it('rejects oversized bodies using the actual streaming byte bound', async () => {
    const oversized = { ...body, fields: { description: 'x'.repeat(MAX_TRANSLATION_BODY_BYTES + 1) } };
    expect((await POST(req(oversized))).status).toBe(413);
    expect(callerRpc).not.toHaveBeenCalled();
    expect(mockedTranslate).not.toHaveBeenCalled();
  });

  it('rejects invalid text/language requests before authorization or provider access', async () => {
    expect((await POST(req({ ...body, targetLanguage: 'fr' }))).status).toBe(400);
    expect(callerRpc).not.toHaveBeenCalled();
    expect(providerRpc).not.toHaveBeenCalled();
  });

  it('returns an actionable unavailable state when no provider is configured', async () => {
    providerRpc.mockReturnValueOnce({ abortSignal: jest.fn().mockResolvedValue({ data: [], error: null }) });
    const result = await POST(req());
    expect(result.status).toBe(503);
    expect((await result.json()).error).toBe('not_configured');
    expect(mockedTranslate).not.toHaveBeenCalled();
  });

  it('refuses an unsupported saved provider without contacting it', async () => {
    providerRpc.mockReturnValueOnce({ abortSignal: jest.fn().mockResolvedValue({ data: [{ ...provider, api_kind: 'anthropic' }], error: null }) });
    const result = await POST(req());
    expect(result.status).toBe(503);
    expect((await result.json()).error).toBe('not_configured');
    expect(mockedTranslate).not.toHaveBeenCalled();
  });

  it('does not expose secret-bearing configuration errors', async () => {
    providerRpc.mockReturnValueOnce({ abortSignal: jest.fn().mockRejectedValue(new Error('vault-secret')) });
    const result = await POST(req());
    expect(result.status).toBe(502);
    expect(await result.text()).not.toContain('vault-secret');
  });

  it('releases the shared AI lease after a failed translation', async () => {
    mockedTranslate.mockRejectedValueOnce(new TranslationError('invalid_translation', 'Réessayez.'));
    expect((await POST(req())).status).toBe(502);
    expect((await POST(req())).status).toBe(200);
  });

  it('refuses a request while another AI operation holds the shared lease', async () => {
    const lease = acquireLease('ai');
    expect(lease).not.toBeNull();
    try {
      const result = await POST(req());
      expect(result.status).toBe(429);
      expect(result.headers.get('Retry-After')).toBeTruthy();
      expect(providerRpc).not.toHaveBeenCalled();
    } finally { lease?.release(); }
  });

  it('bounds repeated translation requests per user', async () => {
    for (let i = 0; i < 12; i++) expect((await POST(req())).status).toBe(200);
    const result = await POST(req());
    expect(result.status).toBe(429);
    expect(result.headers.get('Retry-After')).toBe('60');
    expect(mockedTranslate).toHaveBeenCalledTimes(12);
  });

  it('aborts a slow provider and releases the lease', async () => {
    jest.useFakeTimers();
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    mockedTranslate.mockImplementationOnce((_input, _config, _key, options) => {
      started();
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const pending = POST(req());
    await ready;
    await jest.advanceTimersByTimeAsync(45_000);
    const result = await pending;
    expect(result.status).toBe(504);
    expect((await result.json()).error).toBe('translation_timeout');
    expect((await POST(req())).status).toBe(200);
  });

  it('cancels upstream work when the client aborts and releases the shared AI lease', async () => {
    const client = new AbortController();
    const request = new Request(req(), { signal: client.signal }) as NextRequest;
    const removeListener = jest.spyOn(request.signal, 'removeEventListener');
    let started!: () => void;
    const ready = new Promise<void>((resolve) => { started = resolve; });
    let providerSignal: AbortSignal | undefined;
    mockedTranslate.mockImplementationOnce((_input, _config, _key, options) => {
      providerSignal = options.signal;
      started();
      return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
    });
    const pending = POST(request);
    await ready;
    client.abort();
    await pending;
    expect(providerSignal?.aborted).toBe(true);
    expect(removeListener).toHaveBeenCalledWith('abort', expect.any(Function));
    expect((await POST(req())).status).toBe(200);
  });
});
