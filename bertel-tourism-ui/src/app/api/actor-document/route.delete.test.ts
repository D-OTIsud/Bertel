/** @jest-environment node */
import { DELETE } from './route';
import { readApiErrorMessage } from '@/services/api-error';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const ACTOR_ID = '11111111-2222-3333-4444-555555555555';
const DOCUMENT_ID = '66666666-7777-8888-9999-aaaaaaaaaaaa';

function req(body: unknown, auth = 'Bearer jwt'): never {
  return { headers: new Headers(auth ? { authorization: auth } : {}), json: async () => body } as never;
}

const documentRpc = jest.fn();
const privilegedTable = jest.fn();
const storageBucket = jest.fn();

describe('DELETE /api/actor-document — le `detail` de `delete_failed` n’est JAMAIS le brut moteur', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warn.mockRestore());

  beforeEach(() => {
    warn.mockClear();
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    documentRpc.mockReset();
    privilegedTable.mockClear();
    storageBucket.mockClear();
    mockedCreate.mockReturnValue({ schema: () => ({ rpc: documentRpc }) } as never);
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
      from: privilegedTable,
      storage: { from: storageBucket },
    } as never);
  });

  async function del(deleteError: unknown, outcome = 'deleted') {
    documentRpc.mockResolvedValue({ data: deleteError ? null : outcome, error: deleteError });
    const res = await DELETE(req({ actorId: ACTOR_ID, documentId: DOCUMENT_ID }));
    return {
      status: res.status,
      payload: (await res.json()) as { error?: string; detail?: string },
      requestId: res.headers.get('x-request-id'),
    };
  }

  it('retire uniquement la paire par le RPC appelant', async () => {
    const { status, payload } = await del(null);
    expect(status).toBe(200);
    expect(payload).toEqual({ deleted: true });
    expect(documentRpc).toHaveBeenCalledTimes(1);
    expect(documentRpc).toHaveBeenCalledWith('unlink_crm_actor_document', {
      p_actor_id: ACTOR_ID, p_document_id: DOCUMENT_ID,
    });
    expect(privilegedTable).not.toHaveBeenCalled();
    expect(storageBucket).not.toHaveBeenCalled();
  });

  it.each([
    ['forbidden', 403, 'forbidden'],
    ['not_found', 404, 'not_found'],
    ['file_missing', 404, 'file_missing'],
    ['unexpected_bucket', 409, 'unexpected_bucket'],
    ['promoted_document', 409, 'promoted_document'],
    ['portal_photo', 409, 'delete_failed'],
  ])('conserve le statut du retrait %s', async (outcome, code, label) => {
    const { status, payload } = await del(null, outcome);
    expect(status).toBe(code);
    expect(payload.error).toBe(label);
    expect(privilegedTable).not.toHaveBeenCalled();
    expect(storageBucket).not.toHaveBeenCalled();
  });

  it('une violation de clé étrangère ne fait plus fuiter la table ni la contrainte', async () => {
    const { status, payload } = await del({
      code: '23503',
      message: 'update or delete on table "ref_document" violates foreign key constraint "object_document_document_id_fkey"',
    });

    expect(status).toBe(500);
    expect(payload.error).toBe('delete_failed');
    expect(payload.detail).not.toMatch(/ref_document|foreign key|violates|constraint/i);
    // …et il DIT quelque chose d'utile : la ligne est encore référencée, pas « supprimée entre-temps ».
    expect(payload.detail).toMatch(/encore utilisé/i);
    // Bout en bout : c'est bien ce que l'utilisateur lit, allowlist comprise.
    expect(readApiErrorMessage(payload, status)).toBe(payload.detail);
  });

  it('un refus RLS devient la phrase FR des droits insuffisants', async () => {
    const { payload, status } = await del({ code: '42501', message: 'permission denied for table ref_document' });
    expect(payload.detail).toMatch(/pas autorisée/i);
    expect(readApiErrorMessage(payload, status)).toMatch(/pas autorisée/i);
  });

  it('un SQLSTATE non actionnable ⇒ AUCUN detail, et l’utilisateur lit le libellé générique FR', async () => {
    const { status, payload, requestId } = await del({ code: 'XX000', message: 'internal error: cache lookup failed for relation 1234' });

    expect(payload.error).toBe('delete_failed');
    expect(payload.detail).toBeUndefined();
    expect(readApiErrorMessage(payload, status)).toBe('La suppression a échoué.');
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(warn.mock.calls).toEqual([['[route-error]', { route: 'actor-document.DELETE', code: 'delete_failed', requestId }]]);
  });

  it('une erreur PostgREST sans code ⇒ AUCUN detail non plus', async () => {
    const { payload } = await del({ message: 'FetchError: request to https://x.supabase.co failed' });
    expect(payload.detail).toBeUndefined();
  });
});
