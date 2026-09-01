/** @jest-environment node */
import { PRIVATE_BUCKET, UUID_SHAPE, authenticated, callerClient } from './_document-auth';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

// Le socle est consommé par les deux familles de routes documents (acteur et tâche). Ses
// gardes sont déjà asservies depuis chaque route ; ces tests-ci le prennent DIRECTEMENT,
// pour que la définition partagée reste vérifiable sans passer par un handler.

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const SUPABASE_URL = 'https://project.supabase.co';
const ANON_KEY = 'anon-key';
const SERVICE_KEY = 'service-role-key';

beforeAll(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = ANON_KEY;
});

function req(headers: Record<string, string> = {}) {
  return { headers: new Headers(headers) } as never;
}

describe('_document-auth — authenticated', () => {
  beforeEach(() => jest.clearAllMocks());

  it('500 server_misconfigured quand le client service_role est absent', async () => {
    mockedServer.mockReturnValue(null as never);
    const auth = await authenticated(req({ authorization: 'Bearer jwt' }));
    expect(auth.ok).toBe(false);
    if (auth.ok) throw new Error('unreachable');
    expect(auth.response.status).toBe(500);
    await expect(auth.response.json()).resolves.toEqual({ error: 'server_misconfigured' });
  });

  it.each([
    ['en-tête absent', {}],
    ['schéma non Bearer', { authorization: 'Basic abc' }],
    ['Bearer vide', { authorization: 'Bearer   ' }],
  ])('401 unauthenticated — %s, sans même interroger getUser', async (_label, headers) => {
    const getUser = jest.fn();
    mockedServer.mockReturnValue({ auth: { getUser } } as never);
    const auth = await authenticated(req(headers));
    expect(auth.ok).toBe(false);
    if (auth.ok) throw new Error('unreachable');
    expect(auth.response.status).toBe(401);
    expect(getUser).not.toHaveBeenCalled();
  });

  it('401 unauthenticated quand getUser rejette le JWT', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: { message: 'invalid' } }) },
    } as never);
    const auth = await authenticated(req({ authorization: 'Bearer jwt' }));
    expect(auth.ok).toBe(false);
  });

  it('401 unauthenticated quand getUser réussit sans utilisateur', async () => {
    mockedServer.mockReturnValue({
      auth: { getUser: jest.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    } as never);
    const auth = await authenticated(req({ authorization: 'Bearer jwt' }));
    expect(auth.ok).toBe(false);
  });

  it('rend le JWT BRUT (sans le préfixe ni les espaces) et l’identifiant appelant', async () => {
    // Le JWT rendu est celui que chaque famille passe à son gate : un préfixe « Bearer »
    // resté collé produirait un client appelant anonyme — donc un gate faux en silence.
    const getUser = jest.fn().mockResolvedValue({ data: { user: { id: 'u-42' } }, error: null });
    mockedServer.mockReturnValue({ auth: { getUser } } as never);
    const auth = await authenticated(req({ authorization: 'Bearer  the.jwt.value  ' }));
    expect(auth.ok).toBe(true);
    if (!auth.ok) throw new Error('unreachable');
    expect(auth.jwt).toBe('the.jwt.value');
    expect(auth.userId).toBe('u-42');
    expect(getUser).toHaveBeenCalledWith('the.jwt.value');
  });
});

describe('_document-auth — callerClient', () => {
  beforeEach(() => jest.clearAllMocks());

  it('construit un client ANON portant le JWT appelant, jamais la service key', async () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SERVICE_KEY;
    callerClient('the.jwt.value');
    expect(mockedCreate).toHaveBeenCalledWith(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: 'Bearer the.jwt.value' } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [, key] = mockedCreate.mock.calls[0];
    expect(key).not.toBe(SERVICE_KEY);
  });
});

describe('_document-auth — constantes', () => {
  it('UUID_SHAPE accepte un UUID et refuse tout le reste', () => {
    expect(UUID_SHAPE.test('11111111-2222-3333-4444-555555555555')).toBe(true);
    expect(UUID_SHAPE.test('AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE')).toBe(true);
    for (const invalid of [
      '', 'pas-un-uuid',
      '11111111-2222-3333-4444-55555555555', // un caractère de trop court
      '11111111-2222-3333-4444-5555555555555', // un de trop
      '11111111222233334444555555555555', // sans tirets
      ' 11111111-2222-3333-4444-555555555555', // espace de tête
      '11111111-2222-3333-4444-555555555555\n', // saut de ligne final
      'gggggggg-2222-3333-4444-555555555555', // hors hexadécimal
    ]) {
      expect(UUID_SHAPE.test(invalid)).toBe(false);
    }
  });

  it('le bucket privé est celui des documents CRM', () => {
    expect(PRIVATE_BUCKET).toBe('actor-documents');
  });
});
