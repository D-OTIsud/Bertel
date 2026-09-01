/** @jest-environment node */
import { POST } from './route';
import { readApiErrorMessage } from '@/services/api-error';

const rpcMock = jest.fn();
const getUserMock = jest.fn();
const getServerSupabaseClientMock = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getServerSupabaseClient: () => getServerSupabaseClientMock(),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ schema: () => ({ rpc: rpcMock }) }),
}));

function req(body: unknown, auth = 'Bearer jwt-123'): never {
  return {
    headers: { get: (k: string) => (k === 'authorization' ? auth : null) },
    json: async () => body,
  } as never;
}

/**
 * `erase_failed` est dans `CODES_WITH_BUSINESS_DETAIL` (api-error.ts) et c'est VOULU : les `RAISE`
 * de `api.rpc_gdpr_erase_subject` sont des phrases françaises bien plus précises que
 * « L'effacement a échoué. ». Ces tests fixent la frontière : ces messages-là passent, ceux du
 * MOTEUR (RLS, timeout, JWT expiré) non.
 */
describe('POST /api/rgpd/erase — le message métier passe, le brut moteur non', () => {
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  afterAll(() => warn.mockRestore());

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });
  beforeEach(() => {
    jest.clearAllMocks();
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    getServerSupabaseClientMock.mockReturnValue({
      auth: { getUser: getUserMock },
      storage: { from: () => ({ remove: jest.fn().mockResolvedValue({ error: null }) }) },
    });
  });

  async function eraseWith(error: unknown) {
    rpcMock.mockResolvedValue({ data: null, error });
    const res = await POST(req({ subjectKind: 'actor', subjectId: 'a1', mode: 'anonymize' }));
    const payload = (await res.json()) as { error?: string; detail?: string };
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
