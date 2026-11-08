/** @jest-environment node */
import { POST } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('@/lib/request-body.server', () => {
  const actual = jest.requireActual('@/lib/request-body.server');
  return { ...actual, readBoundedJson: jest.fn((req: { json: () => Promise<unknown> }) => req.json()) };
});

const CALLER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SUBJECT = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REQUEST = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPERATION = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const START = { requestId: REQUEST, subjectKind: 'actor', subjectId: SUBJECT, mode: 'anonymize' };
type Reply = { data: unknown; error: { code?: string; message: string } | null };
type Handler = (params: Record<string, unknown>) => Reply | Promise<Reply>;

function request(body: unknown): never {
  return { headers: new Headers({ authorization: 'Bearer synthetic-only' }), json: async () => body } as never;
}

function harness(handlers: Record<string, Handler> = {}) {
  const report = { operationId: OPERATION, startRequestId: REQUEST };
  const callerRpc = jest.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === 'is_platform_superuser') return { data: true, error: null };
    if (handlers[name]) return handlers[name](params);
    throw new Error('Unexpected caller RPC');
  });
  const serverRpc = jest.fn(async (name: string, params: Record<string, unknown>) => {
    if (name === 'rpc_gdpr_get_cleanup_status') {
      if (params.p_operation_id === null) return { data: null, error: { code: 'P0002', message: 'synthetic missing' } };
      return { data: { operationId: OPERATION, subjectKind: 'actor', subjectId: SUBJECT,
        mode: 'anonymize', report, tasks: [] }, error: null };
    }
    throw new Error('Unexpected server RPC');
  });
  const remove = jest.fn();
  const deleteUser = jest.fn();
  const storageFrom = jest.fn(() => ({ remove }));
  const from = jest.fn();
  jest.mocked(getServerSupabaseClient).mockReturnValue({
    auth: { getUser: jest.fn(async () => ({ data: { user: { id: CALLER } }, error: null })), admin: { deleteUser } },
    storage: { from: storageFrom }, from, schema: () => ({ rpc: serverRpc }),
  } as never);
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc: callerRpc }) } as never);
  return { callerRpc, serverRpc, remove, deleteUser, storageFrom, from, report };
}

function expectNoCleanup(h: ReturnType<typeof harness>) {
  expect(h.remove).not.toHaveBeenCalled();
  expect(h.storageFrom).not.toHaveBeenCalled();
  expect(h.deleteUser).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
  expect(h.callerRpc.mock.calls.every(([n]) => n !== 'rpc_gdpr_erase_subject')).toBe(true);
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://synthetic.invalid';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon';
});

describe('START recovery is a separate read, never a destructive fallback', () => {
  it('returns exactly the request binding with no capability probe, claim, or provider', async () => {
    const h = harness({ rpc_gdpr_find_start_request: () => ({ data: { requestId: REQUEST, operationId: OPERATION }, error: null }) });
    const response = await POST(request({ requestId: REQUEST }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requestId: REQUEST, operationId: OPERATION });
    expect(h.callerRpc.mock.calls).toEqual([
      ['is_platform_superuser', undefined], ['rpc_gdpr_find_start_request', { p_request_id: REQUEST }],
    ]);
    expect(h.serverRpc).not.toHaveBeenCalled();
    expectNoCleanup(h);
  });

  it.each([
    ['absent or still uncommitted', { data: null, error: { code: 'P0002', message: 'synthetic missing' } }, 404, 'operation_not_found'],
    ['no explicit absence', { data: null, error: null }, 500, 'operation_lookup_failed'],
    ['wrong request', { data: { requestId: OTHER, operationId: OPERATION }, error: null }, 500, 'operation_lookup_failed'],
    ['wrong operation', { data: { requestId: REQUEST, operationId: 'invalid' }, error: null }, 500, 'operation_lookup_failed'],
    ['unexpected field', { data: { requestId: REQUEST, operationId: OPERATION, report: {} }, error: null }, 500, 'operation_lookup_failed'],
    ['data and error', { data: { requestId: REQUEST, operationId: OPERATION }, error: { code: 'P0002', message: 'synthetic missing' } }, 500, 'operation_lookup_failed'],
  ] as const)('refuses %s without START or provider', async (_label, reply, status, error) => {
    const h = harness({ rpc_gdpr_find_start_request: () => reply });
    const response = await POST(request({ requestId: REQUEST }));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
    expect(h.callerRpc.mock.calls.map(([name]) => name)).toEqual(['is_platform_superuser', 'rpc_gdpr_find_start_request']);
    expect(h.serverRpc).not.toHaveBeenCalled();
    expectNoCleanup(h);
  });

  it('sanitizes a thrown lookup failure and never falls through to START', async () => {
    const h = harness({ rpc_gdpr_find_start_request: () => { throw new Error('SYNTHETIC_SECRET'); } });
    const response = await POST(request({ requestId: REQUEST }));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'operation_lookup_failed' });
    expect(h.serverRpc).not.toHaveBeenCalled();
    expectNoCleanup(h);
  });

  it.each([
    { subjectKind: 'actor', subjectId: SUBJECT },
    { ...START, requestId: 'invalid' },
    { requestId: REQUEST, operationId: OPERATION },
    { ...START, operationId: OPERATION },
  ])('rejects missing/malformed/mixed identities before a destructive RPC', async (body) => {
    const h = harness();
    const response = await POST(request(body));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'bad_request' });
    expect(h.callerRpc.mock.calls.map(([name]) => name)).toEqual(['is_platform_superuser']);
    expect(h.serverRpc).not.toHaveBeenCalled();
    expectNoCleanup(h);
  });

  it('calls only the stable wrapper, with the distinct request reference', async () => {
    const h = harness({ rpc_gdpr_start_erasure: () => ({ data: { operationId: OPERATION, startRequestId: REQUEST }, error: null }) });
    const response = await POST(request(START));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ operationId: OPERATION, status: 'completed' });
    expect(h.callerRpc.mock.calls).toEqual([
      ['is_platform_superuser', undefined],
      ['rpc_gdpr_start_erasure', { p_request_id: REQUEST, p_subject_kind: 'actor', p_subject_id: SUBJECT, p_mode: 'anonymize', p_reason: null }],
    ]);
    expect(h.serverRpc.mock.calls[0]).toEqual(['rpc_gdpr_get_cleanup_status', { p_operation_id: null }]);
    expectNoCleanup(h);
  });

  it('a lost START result leaves cleanup untouched; lookup alone recovers the real operation', async () => {
    const h = harness({
      rpc_gdpr_start_erasure: () => { throw new Error('SYNTHETIC_LOST_ACK'); },
      rpc_gdpr_find_start_request: () => ({ data: { requestId: REQUEST, operationId: OPERATION }, error: null }),
    });
    const failed = await POST(request(START));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: 'erase_failed' });
    expect(h.serverRpc).toHaveBeenCalledTimes(1); // Capability only; no task loading.
    const recovered = await POST(request({ requestId: REQUEST }));
    expect(await recovered.json()).toEqual({ requestId: REQUEST, operationId: OPERATION });
    expect(h.callerRpc.mock.calls.filter(([name]) => name === 'rpc_gdpr_start_erasure')).toHaveLength(1);
    expect(h.serverRpc).toHaveBeenCalledTimes(1);
    expectNoCleanup(h);
  });

  it('rejects a returned operation not bound to the supplied request before cleanup', async () => {
    const h = harness({ rpc_gdpr_start_erasure: () => ({ data: { operationId: OPERATION, startRequestId: OTHER }, error: null }) });
    const response = await POST(request(START));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'setup_incomplete' });
    expect(h.serverRpc).toHaveBeenCalledTimes(1);
    expectNoCleanup(h);
  });

  it('keeps conflicting or unresolved requests generic and dispatches nothing', async () => {
    const h = harness({ rpc_gdpr_start_erasure: () => ({ data: null, error: { code: 'PT409', message: 'SYNTHETIC_PRIVATE_BINDING' } }) });
    const response = await POST(request(START));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'bad_request' });
    expect(h.serverRpc).toHaveBeenCalledTimes(1);
    expectNoCleanup(h);
  });
});
