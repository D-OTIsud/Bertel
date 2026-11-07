/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));

import { getServerSupabaseClient } from './supabase-server';
import { callPublicRpc } from './public-api';

const clientMock = getServerSupabaseClient as jest.Mock;
const rpcMock = jest.fn();
const genericError = { ok: false, status: 502, body: { error: 'upstream_error', detail: 'upstream error' } };

beforeEach(() => {
  clientMock.mockReset();
  clientMock.mockReturnValue({ schema: jest.fn().mockReturnValue({ rpc: rpcMock }) });
  rpcMock.mockReset();
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => jest.restoreAllMocks());

it.each(['57014', 'PGRST202'])('logs safe diagnostics for %s and preserves the generic public error', async (code) => {
  jest.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(147.4);
  const secret = 'private@example.com bearer-jwt partner-key search-text cursor-token';
  rpcMock.mockResolvedValue({ data: null, error: { code, message: secret, details: secret, hint: secret } });
  const result = await callPublicRpc('list_object_resources_page_text', {
    p_page_size: 25, p_view: 'full', p_search: secret, p_cursor: secret,
    authorization: secret, api_key: secret, p_data: { email: secret },
  });
  expect(result).toEqual(genericError);
  expect(console.error).toHaveBeenCalledTimes(1);
  expect(console.error).toHaveBeenCalledWith('[public-api] upstream RPC error', {
    rpc: 'list_object_resources_page_text', code, duration_ms: 47, page_size: 25, view: 'full',
  });
  expect(JSON.stringify((console.error as jest.Mock).mock.calls)).not.toContain(secret);
});

it('omits untrusted diagnostic values and absent pagination', async () => {
  rpcMock.mockResolvedValue({ error: { code: 'private@example.com', message: 'secret' } });
  expect(await callPublicRpc('get_object_resource', { p_view: 'private@example.com', p_page_size: 'secret' })).toEqual(genericError);
  expect(console.error).toHaveBeenCalledWith('[public-api] upstream RPC error', {
    rpc: 'get_object_resource', code: null, duration_ms: expect.any(Number),
  });
});

it('keeps allowlist rejection before client access and logging', async () => {
  expect(await callPublicRpc('private_rpc', {})).toEqual({ ok: false, status: 400, body: { error: 'unknown_endpoint' } });
  expect(clientMock).not.toHaveBeenCalled();
  expect(rpcMock).not.toHaveBeenCalled();
  expect(console.error).not.toHaveBeenCalled();
});

it('preserves successful RPC data without logging it', async () => {
  rpcMock.mockResolvedValue({ data: { id: 'object' }, error: null });
  expect(await callPublicRpc('get_object_resource', { p_id: 'object' })).toEqual({ ok: true, status: 200, body: { id: 'object' } });
  expect(console.error).not.toHaveBeenCalled();
});

it.each([
  ['PT400', 400, 'invalid_parameters'], ['PT404', 404, 'not_found'],
  ['PT409', 409, 'conflict'], ['PT503', 503, 'release_unavailable'],
])('maps explicit thesaurus domain errors without exposing SQL text: %s', async (code, status, error) => {
  rpcMock.mockResolvedValue({ data: null, error: { code, message: 'private SQL text' } });
  expect(await callPublicRpc('thesaurus_public', { p_action: 'concepts' })).toEqual({ ok: false, status, body: { error } });
  expect(console.error).not.toHaveBeenCalled();
});

it('does not apply thesaurus error translation to unrelated public RPCs', async () => {
  rpcMock.mockResolvedValue({ data: null, error: { code: 'PT404', message: 'private SQL text' } });
  expect(await callPublicRpc('get_object_resource', {})).toEqual(genericError);
});

it.each(['list_partner_objects_with_vocabulary', 'get_partner_object_with_vocabulary'])(
  'translates invalid atomic-wrapper parameters into safe 400 (%s)', async (name) => {
    rpcMock.mockResolvedValue({ data: null, error: { code: 'PT400', message: 'private SQL state' } });
    expect(await callPublicRpc(name, {})).toEqual({ ok: false, status: 400,
      body: { error: 'bad_request', detail: 'invalid parameters or cursor' } });
  },
);
