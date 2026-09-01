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

/**
 * Le serveur de la route : `actor_document` porte le lien (statut), `ref_document` la métadonnée
 * (lecture du bucket, puis suppression). `deleteError` est ce que rend le DELETE final — le seul
 * point que ces tests exercent.
 */
function serverWith(deleteError: unknown) {
  const remove = jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === 'actor_document') {
      return {
        select: () => ({
          eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { status: 'draft' } }) }) }),
        }),
      };
    }
    return {
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { storage_bucket: 'actor-documents', storage_path: 'actors/a/f.pdf' } }) }),
      }),
      delete: () => ({ eq: async () => ({ error: deleteError }) }),
    };
  });
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    from,
    storage: { from: () => ({ remove }) },
  };
}

describe('DELETE /api/actor-document — le `detail` de `delete_failed` n’est JAMAIS le brut moteur', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warn.mockRestore());

  beforeEach(() => {
    warn.mockClear();
    mockedServer.mockReset();
    mockedCreate.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
    // `user_can_write_crm_actor` → true : la garde d'écriture n'est pas le sujet ici.
    mockedCreate.mockReturnValue({ schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: true, error: null }) }) } as never);
  });

  async function del(deleteError: unknown) {
    mockedServer.mockReturnValue(serverWith(deleteError) as never);
    const res = await DELETE(req({ actorId: ACTOR_ID, documentId: DOCUMENT_ID }));
    return { status: res.status, payload: (await res.json()) as { error?: string; detail?: string } };
  }

  it('200 quand la suppression aboutit', async () => {
    const { status, payload } = await del(null);
    expect(status).toBe(200);
    expect(payload).toEqual({ deleted: true });
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
    const { status, payload } = await del({ code: 'XX000', message: 'internal error: cache lookup failed for relation 1234' });

    expect(payload.error).toBe('delete_failed');
    expect(payload.detail).toBeUndefined();
    expect(readApiErrorMessage(payload, status)).toBe('La suppression a échoué.');
    // Le brut n'est pas perdu : il part au journal serveur.
    expect(JSON.stringify(warn.mock.calls)).toContain('cache lookup failed');
  });

  it('une erreur PostgREST sans code ⇒ AUCUN detail non plus', async () => {
    const { payload } = await del({ message: 'FetchError: request to https://x.supabase.co failed' });
    expect(payload.detail).toBeUndefined();
  });
});
