/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
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

const CALLER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const OPERATION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const OTHER_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const TASK_ID = '11111111-1111-4111-8111-111111111111';
const ALIAS_ID = '22222222-2222-4222-8222-222222222222';

type Params = Record<string, unknown>;
type RpcResult = { data: unknown; error: { code: string; message: string } | null };
type Row = {
  id: string;
  action: 'storage_remove' | 'auth_delete';
  metadata: Record<string, unknown>;
  status: 'pending' | 'succeeded' | 'failed';
  attempts: number;
  lastError: string | null;
  targetKey: string | null;
  attemptId: string | null;
  attemptState: 'claimed' | 'succeeded' | 'unknown' | null;
  receiptTaskId: string | null;
};

const refused = (message: string): RpcResult => ({ data: null, error: { code: '55000', message } });

/** Double en mémoire du contrat SQL, dont l'implémentation réelle est couverte par test_gdpr_cleanup_claims.sql. */
class DurableQueue {
  constructor(readonly rows: Row[]) {}

  private row(id: unknown) {
    return this.rows.find((r) => r.id === id);
  }

  claim(p: Params): RpcResult {
    const row = this.row(p.p_task_id);
    const key = p.p_target_key as string;
    if (!row || row.action !== p.p_expected_action || (row.targetKey && row.targetKey !== key)) {
      return refused('gdpr_cleanup_claim_refused');
    }
    if (row.status === 'succeeded' || row.attemptState) return refused('gdpr_cleanup_attempt_unresolved');
    const owner = this.rows.find((o) => o.targetKey === key && o.attemptState);
    row.targetKey = key;
    if (owner) {
      row.receiptTaskId = owner.id;
      if (owner.attemptState === 'succeeded') {
        row.status = 'succeeded';
        row.lastError = null;
      }
      return { data: { operationId: p.p_operation_id, taskId: row.id, claimOutcome: 'linked', receiptTaskId: owner.id }, error: null };
    }
    row.attemptId = p.p_attempt_id as string;
    row.attemptState = 'claimed';
    row.status = 'pending';
    row.receiptTaskId = null;
    return {
      data: {
        operationId: p.p_operation_id, taskId: row.id, attemptId: row.attemptId, action: row.action,
        metadata: row.metadata, targetKey: key, claimOutcome: 'claimed',
      },
      error: null,
    };
  }

  ack(p: Params): RpcResult {
    const row = this.row(p.p_task_id);
    if (!row || !row.attemptId || row.attemptId !== p.p_attempt_id || row.attemptState !== 'claimed') {
      return refused('gdpr_cleanup_ack_refused');
    }
    row.attempts += 1;
    if (p.p_success) {
      row.status = 'succeeded';
      row.attemptState = 'succeeded';
      row.lastError = null;
      for (const alias of this.rows) {
        if (alias.receiptTaskId === row.id) {
          alias.status = 'succeeded';
          alias.lastError = null;
        }
      }
    } else if (p.p_effect_issued) {
      row.status = 'failed';
      row.attemptState = 'unknown';
      row.lastError = p.p_error as string;
    } else {
      row.status = 'failed';
      row.attemptId = null;
      row.attemptState = null;
      row.lastError = p.p_error as string;
    }
    return { data: { operationId: p.p_operation_id, taskId: row.id, attemptId: p.p_attempt_id, status: row.status, attempts: row.attempts }, error: null };
  }

  refuse(p: Params): RpcResult {
    const row = this.row(p.p_task_id);
    if (!row || row.status === 'succeeded' || row.attemptState) return refused('gdpr_cleanup_refusal_refused');
    row.status = 'failed';
    row.attempts += 1;
    row.lastError = p.p_error as string;
    return { data: { status: row.status, attempts: row.attempts }, error: null };
  }

  tasks() {
    return this.rows.map(({ id, action, metadata, status, attempts, lastError }) => ({ id, action, metadata, status, attempts, lastError }));
  }
}

function task(id: string, action: Row['action'], metadata: Record<string, unknown>): Row {
  return { id, action, metadata, status: 'pending', attempts: 0, lastError: null, targetKey: null, attemptId: null, attemptState: null, receiptTaskId: null };
}

interface HarnessOptions {
  subjectKind?: string;
  mode?: string;
  remove?: jest.Mock;
  deleteUser?: jest.Mock;
  getUserById?: jest.Mock;
  profile?: jest.Mock;
  ownerProbe?: jest.Mock;
  /** Appliqué après le commit du claim : la réponse est perdue ou altérée, pas la durabilité. */
  afterClaim?: (committed: RpcResult) => RpcResult;
  /** Remplace l'ACK avant tout commit : l'issue de l'effet reste inconnue en base. */
  beforeAck?: () => RpcResult;
}

function harness(rows: Row[], opts: HarnessOptions = {}) {
  const queue = new DurableQueue(rows);
  const remove = opts.remove ?? jest.fn().mockResolvedValue({ error: null });
  const deleteUser = opts.deleteUser ?? jest.fn().mockResolvedValue({ error: null });
  const getUserById = opts.getUserById ?? jest.fn().mockResolvedValue({ data: { user: { id: TARGET_ID } }, error: null });
  const maybeSingle = opts.profile ?? jest.fn().mockResolvedValue({ data: { role: 'tourism_agent' }, error: null });
  const interceptors = { afterClaim: opts.afterClaim, beforeAck: opts.beforeAck };
  const rpc = jest.fn(async (name: string, params: Params): Promise<RpcResult> => {
    if (name === 'rpc_gdpr_get_cleanup_status') {
      return {
        data: {
          operationId: OPERATION_ID, subjectKind: opts.subjectKind ?? 'user', subjectId: TARGET_ID,
          mode: opts.mode ?? 'delete', report: {}, tasks: queue.tasks(),
        },
        error: null,
      };
    }
    if (name === 'rpc_gdpr_claim_cleanup_task') {
      const committed = queue.claim(params);
      return interceptors.afterClaim ? interceptors.afterClaim(committed) : committed;
    }
    if (name === 'rpc_gdpr_ack_cleanup_attempt') {
      if (interceptors.beforeAck) return interceptors.beforeAck();
      return queue.ack(params);
    }
    if (name === 'rpc_gdpr_refuse_cleanup_task') return queue.refuse(params);
    return { data: null, error: { code: 'XX000', message: `unexpected rpc ${name}` } };
  });
  mockedServer.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER_ID } }, error: null }),
      admin: { deleteUser, getUserById },
    },
    storage: { from: jest.fn().mockReturnValue({ remove }) },
    from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockReturnValue({ maybeSingle }) }) }),
    schema: () => ({ rpc }),
  } as never);
  const callerRpc = jest.fn(async (name: string) => {
    if (name === 'is_platform_owner' && opts.ownerProbe) return opts.ownerProbe();
    return { data: true, error: null };
  });
  mockedCreate.mockReturnValue({ schema: () => ({ rpc: callerRpc }) } as never);

  const calls = (name: string) => rpc.mock.calls.filter(([called]) => called === name).map(([, params]) => params);
  return { queue, rpc, remove, deleteUser, getUserById, interceptors, calls };
}

function resume() {
  return POST({
    headers: new Headers({ authorization: 'Bearer t' }),
    json: async () => ({ operationId: OPERATION_ID }),
  } as never);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

async function until(condition: () => boolean) {
  for (let i = 0; i < 100 && !condition(); i += 1) {
    await new Promise((res) => setImmediate(res));
  }
  expect(condition()).toBe(true);
}

const MEDIA = { bucket: 'media', path: 'u1/file.jpg' };
const MEDIA_KEY = 'storage_remove:media/u1/file.jpg';
const AVATAR_PATH = `${TARGET_ID}/avatar.jpg`;
const AVATAR_CANONICAL = { bucket: 'avatars', path: AVATAR_PATH };
const AVATAR_ALIAS = { raw_url: `https://x.supabase.co/storage/v1/object/public/avatars/${AVATAR_PATH}?v=2` };

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  mockedReadJson.mockClear();
  mockedReadJson.mockImplementation((r: { json: () => Promise<unknown> }) => r.json());
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('claim exclusif avant tout effet', () => {
  it('deux reprises concurrentes de la même tâche ne produisent qu’un seul effet', async () => {
    const gate = deferred<{ error: null }>();
    const remove = jest.fn(() => gate.promise);
    const h = harness([task(TASK_ID, 'storage_remove', MEDIA)], { remove });

    const first = resume();
    await until(() => remove.mock.calls.length === 1);

    const second = await resume();
    expect(second.status).toBe(207);
    expect((await second.json()).counts.pending).toBe(1);
    expect(remove).toHaveBeenCalledTimes(1);

    gate.resolve({ error: null });
    const done = await first;
    expect(done.status).toBe(200);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')).toHaveLength(1);
  });

  it('claim avant Storage, avec une tentative et une cible normalisée liées à l’ACK', async () => {
    const h = harness([task(TASK_ID, 'storage_remove', MEDIA)]);

    const res = await resume();
    expect(res.status).toBe(200);

    const [claim] = h.calls('rpc_gdpr_claim_cleanup_task');
    expect(claim).toEqual({
      p_operation_id: OPERATION_ID, p_task_id: TASK_ID, p_attempt_id: expect.any(String),
      p_expected_action: 'storage_remove', p_expected_metadata: MEDIA, p_target_key: MEDIA_KEY,
    });
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')).toEqual([{
      p_operation_id: OPERATION_ID, p_task_id: TASK_ID, p_attempt_id: claim.p_attempt_id,
      p_success: true, p_effect_issued: true, p_error: null,
    }]);
    const claimOrder = h.rpc.mock.invocationCallOrder[h.rpc.mock.calls.findIndex(([n]) => n === 'rpc_gdpr_claim_cleanup_task')];
    expect(claimOrder).toBeLessThan(h.remove.mock.invocationCallOrder[0]);
  });
});

describe('alias canonique + raw_url de la même cible', () => {
  it('une seule suppression ; l’alias réussit sur le reçu, sans effet propre', async () => {
    const h = harness([task(TASK_ID, 'storage_remove', AVATAR_CANONICAL), task(ALIAS_ID, 'storage_remove', AVATAR_ALIAS)]);

    const res = await resume();

    expect(res.status).toBe(200);
    expect(h.remove).toHaveBeenCalledTimes(1);
    expect(h.remove).toHaveBeenCalledWith([AVATAR_PATH]);
    expect(h.calls('rpc_gdpr_claim_cleanup_task').map((c) => c.p_target_key)).toEqual([
      `storage_remove:avatars/${AVATAR_PATH}`, `storage_remove:avatars/${AVATAR_PATH}`,
    ]);
    expect(h.queue.rows.map((r) => r.status)).toEqual(['succeeded', 'succeeded']);
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')).toHaveLength(1);
  });

  it('en concurrence, une reprise qui voit l’alias pendant l’effet n’émet rien et le reçu le résout', async () => {
    const gate = deferred<{ error: null }>();
    const remove = jest.fn(() => gate.promise);
    const h = harness(
      [task(TASK_ID, 'storage_remove', AVATAR_CANONICAL), task(ALIAS_ID, 'storage_remove', AVATAR_ALIAS)],
      { remove },
    );

    const first = resume();
    await until(() => remove.mock.calls.length === 1);

    const second = await resume();
    expect(second.status).toBe(207);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(h.queue.rows[1]).toEqual(expect.objectContaining({ status: 'pending', attemptId: null, receiptTaskId: TASK_ID }));

    gate.resolve({ error: null });
    expect((await first).status).toBe(200);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(h.queue.rows.map((r) => r.status)).toEqual(['succeeded', 'succeeded']);
  });

  it('un alias lié à un effet inconnu ne devient jamais un succès', async () => {
    const remove = jest.fn().mockResolvedValue({ error: { message: 'raw provider detail' } });
    const h = harness(
      [task(TASK_ID, 'storage_remove', AVATAR_CANONICAL), task(ALIAS_ID, 'storage_remove', AVATAR_ALIAS)],
      { remove },
    );

    const res = await resume();

    expect(res.status).toBe(207);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(h.queue.rows.map((r) => r.status)).toEqual(['failed', 'pending']);
  });
});

describe('effet accepté puis réponse perdue', () => {
  it.each([
    ['rejet transport', () => jest.fn().mockRejectedValue(new Error('raw transport detail'))],
    ['erreur provider', () => jest.fn().mockResolvedValue({ error: { message: 'raw provider detail' } })],
  ])('%s : la reprise suivante ne renvoie jamais la suppression', async (_name, build) => {
    const remove = build();
    const h = harness([task(TASK_ID, 'storage_remove', MEDIA)], { remove });

    const firstRes = await resume();
    const firstBody = await firstRes.json();
    const secondRes = await resume();
    const secondBody = await secondRes.json();

    expect(remove).toHaveBeenCalledTimes(1);
    expect(firstRes.status).toBe(207);
    expect(firstBody.counts.failed).toBe(1);
    expect(secondBody.status).toBe('failed');
    expect(h.queue.rows[0]).toEqual(expect.objectContaining({ status: 'failed', attemptState: 'unknown' }));
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')[0]).toEqual(expect.objectContaining({ p_success: false, p_effect_issued: true }));
    expect(JSON.stringify([firstBody, secondBody])).not.toMatch(/raw (transport|provider) detail/);
  });

  it('ACK perdu après une suppression réussie : aucun renvoi, tâche jamais présentée comme réussie', async () => {
    const lost = harness([task(TASK_ID, 'storage_remove', MEDIA)], {
      beforeAck: () => { throw new Error('ECONNRESET'); },
    });

    await resume();
    lost.interceptors.beforeAck = undefined;
    const res = await resume();
    const body = await res.json();

    expect(lost.remove).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(207);
    expect(body.status).toBe('failed');
    expect(body.counts).toEqual(expect.objectContaining({ pending: 1, succeeded: 0 }));
    expect(lost.queue.rows[0].attemptState).toBe('claimed');
  });
});

describe('réponse de claim perdue ou mal formée', () => {
  const reject = (): RpcResult => { throw new Error('ECONNRESET'); };
  const altered = (change: (data: Params) => unknown) => (committed: RpcResult): RpcResult => ({
    data: change(committed.data as Params),
    error: null,
  });

  const cases: [string, (committed: RpcResult) => RpcResult][] = [
    ['transport perdu', reject],
    ['erreur renvoyée', () => ({ data: null, error: { code: 'XX000', message: 'boom' } })],
    ['erreur malgré des données', (c) => ({ data: c.data, error: { code: 'XX000', message: 'boom' } })],
    ['réponse vide', altered(() => null)],
    ['réponse non objet', altered(() => [])],
    ['autre opération', altered((d) => ({ ...d, operationId: OTHER_ID }))],
    ['autre tâche', altered((d) => ({ ...d, taskId: OTHER_ID }))],
    ['autre tentative', altered((d) => ({ ...d, attemptId: OTHER_ID }))],
    ['autre action', altered((d) => ({ ...d, action: 'auth_delete' }))],
    ['autres métadonnées', altered((d) => ({ ...d, metadata: { bucket: 'media', path: 'u1/other.jpg' } }))],
    ['autre cible', altered((d) => ({ ...d, targetKey: 'storage_remove:media/u1/other.jpg' }))],
    ['issue absente', altered((d) => ({ ...d, claimOutcome: undefined }))],
    ['issue liée', altered((d) => ({ ...d, claimOutcome: 'linked' }))],
  ];

  it.each(cases)('%s : zéro effet et aucune réadmission de la tentative', async (_name, afterClaim) => {
    const h = harness([task(TASK_ID, 'storage_remove', MEDIA)], { afterClaim });

    await resume();
    const committed = h.queue.rows[0].attemptId;
    h.interceptors.afterClaim = undefined;
    const res = await resume();

    expect(h.remove).not.toHaveBeenCalled();
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')).toHaveLength(0);
    expect(h.queue.rows[0].attemptId).toBe(committed);
    expect(h.queue.rows[0].attemptState).toBe('claimed');
    expect(res.status).toBe(207);
  });

  it('une réponse perdue sur une suppression Auth n’appelle ni la lecture Auth ni deleteUser', async () => {
    const h = harness([task(TASK_ID, 'auth_delete', { user_id: TARGET_ID })], { afterClaim: reject });

    await resume();

    expect(h.getUserById).not.toHaveBeenCalled();
    expect(h.deleteUser).not.toHaveBeenCalled();
  });
});

describe('auth_delete', () => {
  it('claim avant la revérification, un seul deleteUser', async () => {
    const h = harness([task(TASK_ID, 'auth_delete', { user_id: TARGET_ID })]);

    const res = await resume();

    expect(res.status).toBe(200);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
    expect(h.calls('rpc_gdpr_claim_cleanup_task')[0].p_target_key).toBe(`auth_delete:${TARGET_ID}`);
    const claimOrder = h.rpc.mock.invocationCallOrder[h.rpc.mock.calls.findIndex(([n]) => n === 'rpc_gdpr_claim_cleanup_task')];
    expect(claimOrder).toBeLessThan(h.getUserById.mock.invocationCallOrder[0]);
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')[0]).toEqual(expect.objectContaining({ p_success: true, p_effect_issued: true }));
  });

  it('erreur renvoyée par deleteUser : issue inconnue, jamais renvoyée, sans message brut', async () => {
    const deleteUser = jest.fn().mockResolvedValue({ error: { message: 'raw provider detail' } });
    const h = harness([task(TASK_ID, 'auth_delete', { user_id: TARGET_ID })], { deleteUser });

    await resume();
    const res = await resume();

    expect(deleteUser).toHaveBeenCalledTimes(1);
    expect(h.queue.rows[0]).toEqual(expect.objectContaining({ status: 'failed', attemptState: 'unknown', lastError: 'auth_delete_failed' }));
    expect(JSON.stringify(await res.json())).not.toMatch(/raw provider detail/);
  });

  it('refus prouvé avant effet : relançable avec une nouvelle tentative', async () => {
    const profile = jest.fn().mockResolvedValue({ data: { role: 'super_admin' }, error: null });
    const ownerProbe = jest.fn()
      .mockResolvedValueOnce({ data: false, error: null })
      .mockResolvedValueOnce({ data: true, error: null });
    const h = harness([task(TASK_ID, 'auth_delete', { user_id: TARGET_ID })], { profile, ownerProbe });

    await resume();
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.queue.rows[0]).toEqual(expect.objectContaining({
      status: 'failed', attemptState: null, lastError: 'owner_required_for_super_admin_delete',
    }));

    const res = await resume();

    expect(res.status).toBe(200);
    expect(h.deleteUser).toHaveBeenCalledTimes(1);
    const [firstClaim, secondClaim] = h.calls('rpc_gdpr_claim_cleanup_task');
    expect(firstClaim.p_attempt_id).not.toEqual(secondClaim.p_attempt_id);
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')[0]).toEqual(expect.objectContaining({ p_success: false, p_effect_issued: false }));
  });

  it('compte déjà absent (404 explicite) : succès acquitté sans effet envoyé', async () => {
    const getUserById = jest.fn().mockResolvedValue({ data: null, error: { status: 404, code: 'user_not_found', message: 'gone' } });
    const h = harness([task(TASK_ID, 'auth_delete', { user_id: TARGET_ID })], { getUserById });

    const res = await resume();

    expect(res.status).toBe(200);
    expect(h.deleteUser).not.toHaveBeenCalled();
    expect(h.calls('rpc_gdpr_ack_cleanup_attempt')[0]).toEqual(expect.objectContaining({ p_success: true, p_effect_issued: false }));
  });
});

describe('cibles refusées et réussites existantes', () => {
  it('référence externe : marquée en échec sans claim ni effet', async () => {
    const metadata = { raw_url: 'https://evil.example.com/storage/v1/object/public/media/x.jpg' };
    const h = harness([task(TASK_ID, 'storage_remove', metadata)], { subjectKind: 'actor', mode: 'anonymize' });

    const res = await resume();

    expect(h.calls('rpc_gdpr_claim_cleanup_task')).toHaveLength(0);
    expect(h.remove).not.toHaveBeenCalled();
    expect(h.calls('rpc_gdpr_refuse_cleanup_task')).toEqual([{
      p_operation_id: OPERATION_ID, p_task_id: TASK_ID, p_expected_action: 'storage_remove',
      p_expected_metadata: metadata, p_error: 'unresolved_external_or_invalid_reference',
    }]);
    expect(res.status).toBe(207);
  });

  it('avatar d’un autre utilisateur : refusé sans claim', async () => {
    const h = harness([task(TASK_ID, 'storage_remove', { bucket: 'avatars', path: `${OTHER_ID}/avatar.jpg` })]);

    await resume();

    expect(h.calls('rpc_gdpr_claim_cleanup_task')).toHaveLength(0);
    expect(h.remove).not.toHaveBeenCalled();
  });

  it('une tâche déjà réussie n’est plus réclamée', async () => {
    const done = { ...task(TASK_ID, 'storage_remove', MEDIA), status: 'succeeded' as const };
    const h = harness([done]);

    const res = await resume();

    expect(res.status).toBe(200);
    expect(h.calls('rpc_gdpr_claim_cleanup_task')).toHaveLength(0);
    expect(h.remove).not.toHaveBeenCalled();
  });
});
