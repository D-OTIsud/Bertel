/** @jest-environment node */
import { POST } from './route';
import { readApiErrorMessage } from '@/services/api-error';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
// Passthrough par défaut : le chemin d'octets réel de readBoundedJson est testé séparément
// (menu/extract/route.test.ts porte déjà ce test générique) — ici on isole le comportement
// métier, sauf pour le test dédié "413" qui restaure l'implémentation réelle.
jest.mock('@/lib/request-body.server', () => {
  const actual = jest.requireActual('@/lib/request-body.server');
  return { ...actual, readBoundedJson: jest.fn((req: { json: () => Promise<unknown> }) => req.json()) };
});

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { readBoundedJson } from '@/lib/request-body.server';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedReadJson = readBoundedJson as jest.Mock;

function req(headers: Record<string, string>, body: unknown): never {
  return { headers: new Headers(headers), json: async () => body } as never;
}

const CALLER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OWNER_TARGET_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SUPERADMIN_TARGET_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OPERATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
// validateOperationStatus exige un id de tâche au format UUID (un placeholder du style 't1' est rejeté).
const TASK_ID = '11111111-1111-4111-8111-111111111111';

type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcHandler = (params: unknown) => RpcResult | Promise<RpcResult>;
type RpcHandlers = Record<string, RpcHandler>;

function apiClient(handlers: RpcHandlers) {
  // `rpc` STABLE (pas recréé à chaque `schema('api')`) : sinon un `.not.toHaveBeenCalledWith`
  // sur un mock reconstruit à chaque appel serait vacuous.
  const rpc = jest.fn((name: string, params: unknown) =>
    Promise.resolve(
      handlers[name] ? handlers[name](params) : { data: null, error: { message: `unexpected rpc ${name}` } },
    ),
  );
  return { schema: () => ({ rpc }) };
}

function serverClient(opts: {
  handlers?: RpcHandlers;
  capabilityProbe?: RpcHandler;
  removeMock?: jest.Mock;
  deleteUserMock?: jest.Mock;
  getUserByIdMock?: jest.Mock;
  profileMock?: jest.Mock;
}) {
  const remove = opts.removeMock ?? jest.fn().mockResolvedValue({ error: null });
  const deleteUser = opts.deleteUserMock ?? jest.fn().mockResolvedValue({ error: null });
  const getUserById = opts.getUserByIdMock ?? jest.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null });
  const maybeSingle = opts.profileMock ?? jest.fn().mockResolvedValue({ data: { role: 'tourism_agent' }, error: null });
  return {
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null }),
      admin: { deleteUser, getUserById },
    },
    storage: { from: jest.fn().mockReturnValue({ remove }) },
    from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }) }),
    ...apiClient({
      ...opts.handlers,
      rpc_gdpr_get_cleanup_status: (params) => {
        if ((params as { p_operation_id: unknown }).p_operation_id === null) {
          return opts.capabilityProbe
            ? opts.capabilityProbe(params)
            : { data: null, error: { code: 'P0002', message: 'Opération RGPD introuvable: <NULL>' } };
        }
        return opts.handlers?.rpc_gdpr_get_cleanup_status?.(params)
          ?? { data: null, error: { message: 'unexpected rpc rpc_gdpr_get_cleanup_status' } };
      },
    }),
  };
}

function superuserAsCaller(extra: RpcHandlers = {}) {
  return apiClient({ is_platform_superuser: () => ({ data: true, error: null }), ...extra });
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  mockedReadJson.mockClear();
  mockedReadJson.mockImplementation((r: { json: () => Promise<unknown> }) => r.json());
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('authorization', () => {
  it('401 when no bearer token', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    const res = await POST(req({}, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(401);
  });

  it('403 when is_platform_superuser returns false', async () => {
    mockedServer.mockReturnValue(serverClient({}) as never);
    mockedCreate.mockReturnValue(apiClient({ is_platform_superuser: () => ({ data: false, error: null }) }) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(403);
  });

  it('403 fail-closed when is_platform_superuser returns data:true ALONGSIDE an error (never trusted)', async () => {
    mockedServer.mockReturnValue(serverClient({}) as never);
    mockedCreate.mockReturnValue(
      apiClient({ is_platform_superuser: () => ({ data: true, error: { message: 'stale connection' } }) }) as never,
    );
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(403);
  });

  it('500 controlled response when the superuser check throws (transport exception)', async () => {
    mockedServer.mockReturnValue(serverClient({}) as never);
    mockedCreate.mockReturnValue({
      schema: () => ({ rpc: () => { throw new Error('ECONNRESET'); } }),
    } as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('authorization_check_failed');
  });
});

describe('body validation', () => {
  beforeEach(() => {
    mockedServer.mockReturnValue(serverClient({}) as never);
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
  });

  it('400 bad_json when body is an array', async () => {
    const res = await POST(req({ authorization: 'Bearer t' }, [TARGET_ID]));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad_json');
  });

  it('400 bad_json when body is null', async () => {
    const res = await POST(req({ authorization: 'Bearer t' }, null));
    expect((await res.json()).error).toBe('bad_json');
  });

  it('413 request_body_too_large when readBoundedJson throws BodyTooLargeError', async () => {
    const { BodyTooLargeError } = jest.requireActual('@/lib/request-body.server');
    mockedReadJson.mockRejectedValueOnce(new BodyTooLargeError(16 * 1024));
    const res = await POST(req({ authorization: 'Bearer t' }, {}));
    expect(res.status).toBe(413);
  });

  it('400 invalid_subject_id when subjectId is not UUID-shaped', async () => {
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: 'not-a-uuid' }));
    expect((await res.json()).error).toBe('invalid_subject_id');
  });

  it('400 invalid_operation_id when operationId is not UUID-shaped (resume)', async () => {
    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: 'not-a-uuid' }));
    expect((await res.json()).error).toBe('invalid_operation_id');
  });

  it('400 invalid_mode / invalid_subject_kind validated before calling the erase RPC', async () => {
    let res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'nope', subjectId: TARGET_ID }));
    expect((await res.json()).error).toBe('invalid_subject_kind');
    res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID, mode: 'wrong' }));
    expect((await res.json()).error).toBe('invalid_mode');
  });
});

describe('durable-cleanup deployment compatibility', () => {
  const probeFailures: [string, RpcHandler][] = [
    ['missing RPC on the previous database', () => ({ data: null, error: { code: 'PGRST202', message: 'internal missing function details' } })],
    ['database permission failure', () => ({ data: null, error: { code: '42501', message: 'internal privilege details' } })],
    ['transport exception', () => { throw new Error('internal ECONNRESET'); }],
    ['rejected request', () => Promise.reject(new Error('internal fetch failed'))],
    ['null without the expected error', () => ({ data: null, error: null })],
    ['successful operation envelope for SQL NULL', () => ({ data: { operationId: OPERATION_ID }, error: null })],
    ['data alongside P0002', () => ({ data: { operationId: OPERATION_ID }, error: { code: 'P0002', message: 'not found' } })],
    ['missing data alongside P0002', () => ({ data: undefined, error: { code: 'P0002', message: 'not found' } })],
  ];

  it.each(probeFailures)('503 without any erasure, Storage or Auth deletion on %s', async (_name, capabilityProbe) => {
    const eraseRpc = jest.fn(() => ({ data: { mode: 'delete' }, error: null }));
    const remove = jest.fn();
    const deleteUser = jest.fn();
    const server = serverClient({ capabilityProbe, removeMock: remove, deleteUserMock: deleteUser });
    const caller = superuserAsCaller({ rpc_gdpr_erase_subject: eraseRpc });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(caller as never);

    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'user', subjectId: TARGET_ID, mode: 'delete' }));

    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'setup_incomplete' });
    expect(server.schema().rpc).toHaveBeenCalledTimes(1);
    expect(server.schema().rpc).toHaveBeenCalledWith('rpc_gdpr_get_cleanup_status', { p_operation_id: null });
    expect(caller.schema().rpc).toHaveBeenCalledTimes(1);
    expect(caller.schema().rpc).toHaveBeenCalledWith('is_platform_superuser');
    expect(eraseRpc).not.toHaveBeenCalled();
    expect(server.from).not.toHaveBeenCalled();
    expect(server.storage.from).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(deleteUser).not.toHaveBeenCalled();
  });

  it('requires explicit P0002 before calling erase and keeps the new-schema completion flow', async () => {
    const capabilityProbe = jest.fn(() => ({ data: null, error: { code: 'P0002', message: 'not found' } }));
    const eraseRpc = jest.fn(() => ({ data: { operationId: OPERATION_ID }, error: null }));
    const server = serverClient({
      capabilityProbe,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({
          data: { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [] },
          error: null,
        }),
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(superuserAsCaller({ rpc_gdpr_erase_subject: eraseRpc }) as never);

    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(expect.objectContaining({ ok: true, operationId: OPERATION_ID, status: 'completed' }));
    expect(capabilityProbe).toHaveBeenCalledWith({ p_operation_id: null });
    expect(eraseRpc).toHaveBeenCalledTimes(1);
    expect(capabilityProbe.mock.invocationCallOrder[0]).toBeLessThan(eraseRpc.mock.invocationCallOrder[0]);
  });

  it('keeps resume independent of the start probe and never re-erases', async () => {
    const capabilityProbe = jest.fn(() => ({ data: null, error: { code: 'PGRST202', message: 'unavailable' } }));
    const eraseRpc = jest.fn();
    const server = serverClient({
      capabilityProbe,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({
          data: { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [] },
          error: null,
        }),
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(superuserAsCaller({ rpc_gdpr_erase_subject: eraseRpc }) as never);

    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));

    expect(res.status).toBe(200);
    expect(capabilityProbe).not.toHaveBeenCalled();
    expect(eraseRpc).not.toHaveBeenCalled();
    expect(server.schema().rpc).not.toHaveBeenCalledWith('rpc_gdpr_get_cleanup_status', { p_operation_id: null });
  });
});

describe('start flow', () => {
  it('500 setup_incomplete when the erase RPC succeeds but returns no operationId', async () => {
    mockedServer.mockReturnValue(serverClient({}) as never);
    mockedCreate.mockReturnValue(
      superuserAsCaller({ rpc_gdpr_erase_subject: () => ({ data: { mode: 'anonymize' }, error: null }) }) as never,
    );
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('setup_incomplete');
  });

  it('recoverable partial (207, cleanupStatusUnavailable) when the initial status load fails after a committed erase — never a generic 500, never a re-erase', async () => {
    const eraseRpc = jest.fn(() => ({ data: { operationId: OPERATION_ID }, error: null }));
    mockedServer.mockReturnValue(
      serverClient({ handlers: { rpc_gdpr_get_cleanup_status: () => ({ data: null, error: { message: 'db down' } }) } }) as never,
    );
    mockedCreate.mockReturnValue(superuserAsCaller({ rpc_gdpr_erase_subject: eraseRpc }) as never);

    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    const json = await res.json();
    expect(res.status).toBe(207);
    expect(json.ok).toBe(false);
    expect(json.operationId).toBe(OPERATION_ID);
    expect(json.cleanupStatusUnavailable).toBe(true);
    expect(eraseRpc).toHaveBeenCalledTimes(1);
  });

  it('completed (200) when a storage_remove task resolves and is acked', async () => {
    let acked: unknown = null;
    const remove = jest.fn().mockResolvedValue({ error: null });
    const server = serverClient({
      removeMock: remove,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({
          data: {
            operationId: OPERATION_ID,
            subjectKind: 'actor',
            subjectId: TARGET_ID,
            mode: 'anonymize',
            report: {},
            tasks: [
              {
                id: TASK_ID,
                action: 'storage_remove',
                metadata: { bucket: 'avatars', path: 'u1/avatar.jpg' },
                status: acked ? 'succeeded' : 'pending',
                attempts: acked ? 1 : 0,
                lastError: null,
              },
            ],
          },
          error: null,
        }),
        rpc_gdpr_ack_cleanup_task: (params) => {
          acked = params;
          return { data: { id: TASK_ID, status: 'succeeded', attempts: 1 }, error: null };
        },
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(
      superuserAsCaller({ rpc_gdpr_erase_subject: () => ({ data: { operationId: OPERATION_ID }, error: null }) }) as never,
    );
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(remove).toHaveBeenCalledWith(['u1/avatar.jpg']);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.status).toBe('completed');
  });

  it('ack failure never crashes the route (207 partial, operationId preserved)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const server = serverClient({
      removeMock: remove,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({
          data: {
            operationId: OPERATION_ID,
            subjectKind: 'actor',
            subjectId: TARGET_ID,
            mode: 'anonymize',
            report: {},
            tasks: [{ id: TASK_ID, action: 'storage_remove', metadata: { bucket: 'avatars', path: 'u1/avatar.jpg' }, status: 'pending', attempts: 0, lastError: null }],
          },
          error: null,
        }),
        rpc_gdpr_ack_cleanup_task: () => { throw new Error('network blip'); },
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(
      superuserAsCaller({ rpc_gdpr_erase_subject: () => ({ data: { operationId: OPERATION_ID }, error: null }) }) as never,
    );
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    expect(res.status).toBe(207);
    expect((await res.json()).operationId).toBe(OPERATION_ID);
  });

  it('refresh failure after processing surfaces cleanupStatusUnavailable rather than stale success', async () => {
    let getStatusCalls = 0;
    const server = serverClient({
      handlers: {
        rpc_gdpr_get_cleanup_status: () => {
          getStatusCalls += 1;
          if (getStatusCalls === 1) {
            return {
              data: {
                operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {},
                tasks: [{ id: TASK_ID, action: 'storage_remove', metadata: { bucket: 'avatars', path: 'u1/avatar.jpg' }, status: 'pending', attempts: 0, lastError: null }],
              },
              error: null,
            };
          }
          return { data: null, error: { message: 'db down' } };
        },
        rpc_gdpr_ack_cleanup_task: () => ({ data: { id: TASK_ID, status: 'succeeded', attempts: 1 }, error: null }),
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(
      superuserAsCaller({ rpc_gdpr_erase_subject: () => ({ data: { operationId: OPERATION_ID }, error: null }) }) as never,
    );
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID }));
    const json = await res.json();
    expect(res.status).toBe(207);
    expect(json.cleanupStatusUnavailable).toBe(true);
    expect(json.status).not.toBe('completed');
  });
});

/** Preserve master's business-message / database-engine translation boundary with
 * the durable-cleanup authorization, UUID validation and preflight fixtures. */
describe('POST /api/rgpd/erase — le message métier passe, le brut moteur non', () => {
  let warn: jest.SpyInstance;
  beforeAll(() => {
    warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterAll(() => warn.mockRestore());

  async function eraseWith(error: RpcResult['error']) {
    mockedServer.mockReturnValue(serverClient({}) as never);
    const eraseRpc = jest.fn(() => ({ data: null, error }));
    mockedCreate.mockReturnValue(superuserAsCaller({ rpc_gdpr_erase_subject: eraseRpc }) as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize' }));
    const payload = (await res.json()) as { error?: string; detail?: string };
    // A refusal earlier in authorization/preflight must not make these assertions vacuous.
    expect(eraseRpc).toHaveBeenCalledTimes(1);
    return { status: res.status, payload, shown: readApiErrorMessage(payload, res.status) };
  }

  it('relaie TEL QUEL le message français du RAISE de la garde (raison d’être de l’allowlist)', async () => {
    const message = 'Effacement RGPD réservé aux administrateurs plateforme (référent RGPD / superuser).';
    const { status, shown } = await eraseWith({ code: 'P0001', message });
    expect(status).toBe(403);
    expect(shown).toBe(message);
  });

  it('relaie aussi un RAISE métier plus précis que le libellé générique', async () => {
    const { status, shown } = await eraseWith({ code: 'P0001', message: 'Acteur introuvable: a1' });
    expect(status).toBe(400);
    expect(shown).toBe('Acteur introuvable: a1');
  });

  it('un refus RLS du moteur devient une phrase FR — jamais « permission denied for table … »', async () => {
    const { payload, shown } = await eraseWith({ code: '42501', message: 'permission denied for table actor' });
    expect(payload.detail).not.toMatch(/permission denied|for table/i);
    expect(shown).toMatch(/pas autorisée/i);
  });

  it('un timeout du moteur devient une phrase FR actionnable', async () => {
    const { shown } = await eraseWith({ code: '57014', message: 'canceling statement due to statement timeout' });
    expect(shown).not.toMatch(/canceling statement/i);
    expect(shown).toMatch(/trop de temps/);
  });

  it('un JWT expiré ne s’affiche plus en anglais', async () => {
    const { shown } = await eraseWith({ code: 'PGRST301', message: 'JWT expired' });
    expect(shown).toMatch(/reconnectez-vous/i);
  });
});

describe('resume — initial lookup: not_found vs error, never leaks raw messages, never throws', () => {
  it('404 operation_not_found ONLY when data is null AND there is no error', async () => {
    mockedServer.mockReturnValue(
      serverClient({ handlers: { rpc_gdpr_get_cleanup_status: () => ({ data: null, error: null }) } }) as never,
    );
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('operation_not_found');
  });

  it('500 operation_lookup_failed (never operation_not_found, never the raw message) when the RPC returns an error', async () => {
    mockedServer.mockReturnValue(
      serverClient({
        handlers: { rpc_gdpr_get_cleanup_status: () => ({ data: null, error: { message: 'internal secret detail' } }) },
      }) as never,
    );
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('operation_lookup_failed');
    expect(JSON.stringify(json)).not.toMatch(/internal secret detail/);
  });

  it('500 operation_lookup_failed (never throws) when the RPC call itself rejects', async () => {
    mockedServer.mockReturnValue(
      serverClient({
        handlers: {
          rpc_gdpr_get_cleanup_status: () => {
            throw new Error('ECONNRESET');
          },
        },
      }) as never,
    );
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('operation_lookup_failed');
  });

  it('treats a mismatched operationId in the returned envelope as an error, never trusting it', async () => {
    mockedServer.mockReturnValue(
      serverClient({
        handlers: {
          rpc_gdpr_get_cleanup_status: () => ({
            data: { operationId: 'ffffffff-ffff-4fff-8fff-ffffffffffff', subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [] },
            error: null,
          }),
        },
      }) as never,
    );
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
    const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('operation_lookup_failed');
  });

  it('rejects a task with a non-UUID id / unknown action / unknown status as a malformed envelope', async () => {
    const badTasks = [
      { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [{ id: 'not-a-uuid', action: 'storage_remove', metadata: {}, status: 'pending', attempts: 0, lastError: null }] },
      { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [{ id: TASK_ID, action: 'delete_everything', metadata: {}, status: 'pending', attempts: 0, lastError: null }] },
      { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [{ id: TASK_ID, action: 'storage_remove', metadata: 'not-an-object', status: 'pending', attempts: 0, lastError: null }] },
    ];
    for (const data of badTasks) {
      mockedServer.mockReturnValue(
        serverClient({ handlers: { rpc_gdpr_get_cleanup_status: () => ({ data, error: null }) } }) as never,
      );
      mockedCreate.mockReturnValue(superuserAsCaller() as never);
      const res = await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
      expect(res.status).toBe(500);
      expect((await res.json()).error).toBe('operation_lookup_failed');
    }
  });
});

describe('storage path hardening', () => {
  function taskWith(metadata: Record<string, unknown>) {
    return { id: TASK_ID, action: 'storage_remove' as const, metadata, status: 'pending' as const, attempts: 0, lastError: null };
  }

  async function runResumeWith(metadata: Record<string, unknown>, remove: jest.Mock, ackSpy: jest.Mock) {
    const server = serverClient({
      removeMock: remove,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({
          data: { operationId: OPERATION_ID, subjectKind: 'actor', subjectId: TARGET_ID, mode: 'anonymize', report: {}, tasks: [taskWith(metadata)] },
          error: null,
        }),
        rpc_gdpr_ack_cleanup_task: (params) => {
          ackSpy(params);
          return { data: { id: TASK_ID, status: 'failed', attempts: 1 }, error: null };
        },
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(superuserAsCaller() as never);
    return POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
  }

  it('rejects a foreign origin — never removed locally', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://evil.example.com/storage/v1/object/public/media/x.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false }));
  });

  it('rejects embedded credentials in the URL', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://user:pass@x.supabase.co/storage/v1/object/public/media/x.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a %-encoded traversal that only becomes ".." after decoding (decode THEN validate, never the reverse)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/actor-a/%2e%2e/actor-b/secret.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a raw (unencoded) ../ that the URL parser would otherwise normalize away before we ever see it', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/foo/../other-user/secret.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a double-encoded traversal that only becomes ".." after a SECOND decode pass (residual % after one decode)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/%252e%252e/secret.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects an encoded slash (%2f) inside a path segment — never smuggled into a new separator', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/foo%2f..%2fsecret.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects an encoded backslash (%5c)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/foo%5c..%5csecret.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a DEL (\\x7f) control character', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/media/foo\x7fbar.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a DB-stored path containing a literal % (conservative fail-closed, never guesses at encoding)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ bucket: 'avatars', path: 'u1/file%2ejpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a prefix that merely CONTAINS the marker instead of starting with it', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/evil/storage/v1/object/public/media/x.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a non-allow-listed bucket', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ raw_url: 'https://x.supabase.co/storage/v1/object/public/legal-documents/x.pdf' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('rejects a DB-stored {bucket, path} pair with a traversal segment (same validator as URLs)', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ bucket: 'avatars', path: '../other-user/avatar.jpg' }, remove, ack);
    expect(remove).not.toHaveBeenCalled();
  });

  it('accepts a well-formed {bucket, path} pair', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    const ack = jest.fn();
    await runResumeWith({ bucket: 'avatars', path: 'u1/avatar.jpg' }, remove, ack);
    expect(remove).toHaveBeenCalledWith(['u1/avatar.jpg']);
  });
});

describe('resume — never re-erases, auth_delete re-verified against CURRENT state', () => {
  function operationWithAuthDeleteTask(overrides: Partial<{ subjectKind: string; mode: string; subjectId: string }> = {}) {
    const subjectId = overrides.subjectId ?? TARGET_ID;
    return {
      operationId: OPERATION_ID,
      subjectKind: overrides.subjectKind ?? 'user',
      subjectId,
      mode: overrides.mode ?? 'delete',
      report: {},
      // metadata.user_id DOIT rester égal à subjectId : c'est justement cette association
      // stricte tâche/opération que la route revérifie.
      tasks: [{ id: TASK_ID, action: 'auth_delete' as const, metadata: { user_id: subjectId }, status: 'pending' as const, attempts: 0, lastError: null }],
    };
  }

  function setup(opts: {
    operation?: ReturnType<typeof operationWithAuthDeleteTask>;
    getUserByIdMock?: jest.Mock;
    profileMock?: jest.Mock;
    ownerRpc?: (params: unknown) => { data: unknown; error: { message: string } | null };
    deleteUserMock?: jest.Mock;
  }) {
    const ack = jest.fn().mockResolvedValue({ data: { id: TASK_ID, status: 'succeeded', attempts: 1 }, error: null });
    const operation = opts.operation ?? operationWithAuthDeleteTask();
    const server = serverClient({
      getUserByIdMock: opts.getUserByIdMock,
      profileMock: opts.profileMock,
      deleteUserMock: opts.deleteUserMock,
      handlers: {
        rpc_gdpr_get_cleanup_status: () => ({ data: operation, error: null }),
        rpc_gdpr_ack_cleanup_task: ack,
      },
    });
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(superuserAsCaller(opts.ownerRpc ? { is_platform_owner: opts.ownerRpc } : {}) as never);
    return { server, ack };
  }

  it('never calls rpc_gdpr_erase_subject on resume', async () => {
    const { server } = setup({});
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    // is_platform_superuser only — pas rpc_gdpr_erase_subject.
    const asCallerRpc = mockedCreate.mock.results[0].value.schema().rpc as jest.Mock;
    expect(asCallerRpc).not.toHaveBeenCalledWith('rpc_gdpr_erase_subject', expect.anything());
    void server;
  });

  it('refuses when task subjectId mismatches the operation subject — deleteUser never called', async () => {
    const mismatched = operationWithAuthDeleteTask();
    // Falsifie SEULEMENT la tâche (l'operation.subjectId reste TARGET_ID) : simule une tâche
    // qui ne correspond plus au sujet déclaré de l'opération.
    mismatched.tasks = [{ ...mismatched.tasks[0], metadata: { user_id: OWNER_TARGET_ID } }];
    const deleteUser = jest.fn();
    const { ack } = setup({ operation: mismatched, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'task_subject_mismatch' }));
  });

  it('refuses when operation kind/mode is not user/delete — deleteUser never called', async () => {
    const wrongKind = operationWithAuthDeleteTask({ subjectKind: 'actor' });
    const deleteUser = jest.fn();
    const { ack } = setup({ operation: wrongKind, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'task_operation_mismatch' }));
  });

  it('refuses self (task target === current caller) — deleteUser never called', async () => {
    const selfOp = operationWithAuthDeleteTask({ subjectId: CALLER_ID });
    const deleteUser = jest.fn();
    const { ack } = setup({ operation: selfOp, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'self_delete_forbidden' }));
  });

  it('idempotent: an explicit 404 from getUserById is treated as already-deleted success, deleteUser never called again', async () => {
    const getUserById = jest.fn().mockResolvedValue({ data: null, error: { status: 404, code: 'user_not_found', message: 'User not found' } });
    const deleteUser = jest.fn();
    const { ack } = setup({ getUserByIdMock: getUserById, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: true }));
  });

  it('does NOT infer idempotence from a generic error message lacking the documented 404 code/status', async () => {
    const getUserById = jest.fn().mockResolvedValue({ data: null, error: { message: 'user not found or something' } });
    const deleteUser = jest.fn();
    const { ack } = setup({ getUserByIdMock: getUserById, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'auth_lookup_failed' }));
  });

  it('treats "success but no user" as an ambiguous lookup failure, NEVER as already-deleted (no documented 404/user_not_found signal)', async () => {
    const getUserById = jest.fn().mockResolvedValue({ data: { user: null }, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({ getUserByIdMock: getUserById, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'auth_lookup_failed' }));
  });

  it('rejects an unknown/unexpected profile.role value — never treated as an ordinary target', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'something_unexpected' }, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'target_profile_check_failed' }));
  });

  it('allows a null profile.role (ordinary — same as the delete-user route model)', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: null }, error: null });
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: true }));
  });

  it('fail-closed when the profile lookup errors — deleteUser never called', async () => {
    const profile = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    const deleteUser = jest.fn();
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'target_profile_check_failed' }));
  });

  it('fail-closed when the profile row is missing (Auth account still exists) — deleteUser never called', async () => {
    const profile = jest.fn().mockResolvedValue({ data: null, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'target_profile_check_failed' }));
  });

  it('refuses an owner target unconditionally — deleteUser never called', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'owner' }, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'owner_delete_forbidden' }));
  });

  it('refuses a super_admin target if the resuming caller is not owner — deleteUser never called (target may have been PROMOTED since operation creation)', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({ profileMock: profile, deleteUserMock: deleteUser, ownerRpc: () => ({ data: false, error: null }) });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false, p_error: 'owner_required_for_super_admin_delete' }));
  });

  it('fail-closed when the owner probe errors even if data happens to be true', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    const deleteUser = jest.fn();
    const { ack } = setup({
      profileMock: profile,
      deleteUserMock: deleteUser,
      ownerRpc: () => ({ data: true, error: { message: 'stale' } }),
    });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).not.toHaveBeenCalled();
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: false }));
  });

  it('allows an owner-resuming caller to delete a super_admin target', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const { ack } = setup({
      operation: operationWithAuthDeleteTask({ subjectId: SUPERADMIN_TARGET_ID }),
      profileMock: profile,
      deleteUserMock: deleteUser,
      ownerRpc: () => ({ data: true, error: null }),
    });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).toHaveBeenCalledWith(SUPERADMIN_TARGET_ID);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: true }));
  });

  it('allows an ordinary target', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: null });
    const { ack } = setup({ deleteUserMock: deleteUser });
    await POST(req({ authorization: 'Bearer t' }, { operationId: OPERATION_ID }));
    expect(deleteUser).toHaveBeenCalledWith(TARGET_ID);
    expect(ack).toHaveBeenCalledWith(expect.objectContaining({ p_success: true }));
  });
});
