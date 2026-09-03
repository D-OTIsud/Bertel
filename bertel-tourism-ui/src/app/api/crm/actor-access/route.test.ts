/** @jest-environment node */
import { POST } from './route';

// Gabarit du dépôt pour une route service-role (§164 : src/app/api/admin/invite/route.test.ts) :
// on mocke `@/lib/supabase-server` (le client service_role) ET `@supabase/supabase-js`
// (`createClient`, qui fabrique le client « en tant qu'appelant » de `_document-auth`).
// Les deux mocks sont ce qui rend visible LA question de cette route : QUI évalue le gate.
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreateClient = jest.mocked(createClient);

const ACTOR = '11111111-1111-4111-8111-111111111111';
const OTHER_ACTOR = '22222222-2222-4222-8222-222222222222';

function req(headers: Record<string, string>, body: unknown): never {
  return {
    headers: new Headers(headers),
    json: async () => body,
    url: 'https://app.test/api/crm/actor-access',
  } as never;
}

/** Client « en tant qu'appelant » dont le gate CRM répond `answer`. */
function gate(answer: boolean | null, error: unknown = null) {
  const rpc = jest.fn().mockResolvedValue({ data: answer, error });
  const schema = jest.fn(() => ({ rpc }));
  mockedCreateClient.mockReturnValue({ schema } as never);
  return { rpc, schema };
}

interface StubUser {
  id: string;
  email: string;
  last_sign_in_at: string | null;
  created_at?: string;
}

interface StubOptions {
  /** Valeurs de `actor_channel` de kind `email` pour l'acteur demandé. */
  channels?: string[];
  /** Ligne `app_user_profile` portant `actor_id = <acteur demandé>`. */
  linked?: { id: string; role: string | null } | null;
  /** Comptes `auth.users` connus. */
  users?: StubUser[];
  newUserId?: string;
  inviteError?: { message: string } | null;
  upsertError?: { message: string } | null;
  /** Aucun canal `email` au référentiel (kind introuvable). */
  missingKind?: boolean;
}

/**
 * Client service_role gréé pour les TROIS tables que la route lit (`ref_code_contact_kind`,
 * `actor_channel`, `app_user_profile`) et les quatre verbes admin. Toute autre table lève :
 * une lecture non prévue par le test doit se voir, pas retomber sur un stub complaisant.
 */
function serverStub(options: StubOptions = {}) {
  const users = options.users ?? [];
  const inviteUserByEmail = jest.fn().mockResolvedValue(
    options.inviteError
      ? { data: { user: null }, error: options.inviteError }
      : { data: { user: { id: options.newUserId ?? 'new-user' } }, error: null },
  );
  const listUsers = jest.fn().mockResolvedValue({ data: { users }, error: null });
  const deleteUser = jest.fn().mockResolvedValue({ error: null });
  const getUserById = jest.fn(async (id: string) => ({
    data: { user: users.find((user) => user.id === id) ?? null },
    error: null,
  }));
  const upsert = jest.fn().mockResolvedValue({ error: options.upsertError ?? null });

  const from = jest.fn((table: string) => {
    if (table === 'ref_code_contact_kind') {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: options.missingKind ? null : { id: 'kind-email' }, error: null }),
            }),
          }),
        }),
      };
    }
    if (table === 'actor_channel') {
      return {
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: (options.channels ?? []).map((value) => ({ value })), error: null }),
          }),
        }),
      };
    }
    if (table === 'app_user_profile') {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({ maybeSingle: async () => ({ data: options.linked ?? null, error: null }) }),
          }),
        }),
        upsert,
      };
    }
    throw new Error(`table inattendue dans le stub : ${table}`);
  });

  mockedServer.mockReturnValue({
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'agent-1' } }, error: null }),
      admin: { inviteUserByEmail, listUsers, deleteUser, getUserById },
    },
    from,
  } as never);

  return { inviteUserByEmail, listUsers, deleteUser, getUserById, upsert, from };
}

/** Aucune écriture de compte n'a eu lieu — l'assertion qui donne du mordant aux refus. */
function expectNoAccountWrite(spies: ReturnType<typeof serverStub>) {
  expect(spies.inviteUserByEmail).not.toHaveBeenCalled();
  expect(spies.deleteUser).not.toHaveBeenCalled();
  expect(spies.upsert).not.toHaveBeenCalled();
}

describe('POST /api/crm/actor-access', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreateClient.mockReset();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });

  it('401 sans Bearer — et rien n’est lu en base', async () => {
    const spies = serverStub();
    const res = await POST(req({}, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(401);
    expect(spies.from).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  it('403 quand api.user_can_write_crm_actor rend false — aucune lecture, aucune écriture', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate(false);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    // Le gate PRÉCÈDE toute lecture : un refus ne doit pas même avoir touché app_user_profile.
    expect(spies.from).not.toHaveBeenCalled();
    expect(spies.listUsers).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  it('403 fail-closed quand le gate est en erreur (jamais « on laisse passer »)', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate(null, { message: 'boom' });
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(403);
    expectNoAccountWrite(spies);
  });

  it('403 fail-closed quand le gate rend NULL (hors contexte HTTP — user_can_write_crm_actor n’a pas de COALESCE)', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate(null);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(403);
    expectNoAccountWrite(spies);
  });

  it('le gate est évalué EN TANT QUE L’APPELANT (clé ANON + son JWT), jamais avec la service key', async () => {
    serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    const { rpc, schema } = gate(true);
    await POST(req({ authorization: 'Bearer jwt-agent' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }));
    expect(mockedCreateClient).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer jwt-agent' } },
      }),
    );
    expect(schema).toHaveBeenCalledWith('api');
    expect(rpc).toHaveBeenCalledWith('user_can_write_crm_actor', { p_actor_id: ACTOR });
  });

  it('422 sur un actorId qui n’a pas la forme d’un UUID — avant tout appel réseau', async () => {
    const spies = serverStub();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: 'pas-un-uuid' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_actor');
    expect(mockedCreateClient).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  it('422 sur une action inconnue', async () => {
    serverStub();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'promote', actorId: ACTOR }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_action');
  });

  it('422 quand l’e-mail n’est PAS un canal de CET acteur', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'intrus@ailleurs.re' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('email_not_actor_channel');
    expect(spies.listUsers).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  it('409 email_taken_by_staff : l’e-mail est bien un canal de l’acteur mais appartient à un compte NON-acteur', async () => {
    const spies = serverStub({
      channels: ['agent@otisud.re'],
      linked: null,
      users: [{ id: 'staff-1', email: 'agent@otisud.re', last_sign_in_at: '2026-08-01T00:00:00Z' }],
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'agent@otisud.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken_by_staff');
    expectNoAccountWrite(spies);
  });

  it('409 email_taken_by_staff : même règle pour un « resend » — le compte de staff n’est JAMAIS supprimé', async () => {
    const spies = serverStub({
      channels: ['agent@otisud.re'],
      linked: null,
      // Jamais connecté : sans la garde, la branche resend le SUPPRIMERAIT.
      users: [{ id: 'staff-2', email: 'agent@otisud.re', last_sign_in_at: null }],
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'agent@otisud.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken_by_staff');
    expectNoAccountWrite(spies);
  });

  it('409 email_taken_by_staff : un compte portail d’un AUTRE acteur ne peut pas être repris', async () => {
    const spies = serverStub({
      channels: ['partage@basalte.re'],
      // Le profil lié à CET acteur n'existe pas ; le compte trouvé appartient à un autre.
      linked: null,
      users: [{ id: 'portal-other', email: 'partage@basalte.re', last_sign_in_at: null }],
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: OTHER_ACTOR, email: 'partage@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken_by_staff');
    expectNoAccountWrite(spies);
  });

  it('201 invite nominal : e-mail envoyé vers /set-password?espace=1 + profil {role actor, actor_id}', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate(true);
    const res = await POST(
      req(
        { authorization: 'Bearer t', origin: 'https://bertel.otisud.re' },
        { action: 'invite', actorId: ACTOR, email: 'Marie@Basalte.re ' },
      ),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ userId: 'u-new' });
    // `?espace=1` : SANS lui, /set-password parle au partenaire comme au personnel de l'office.
    expect(spies.inviteUserByEmail).toHaveBeenCalledWith('marie@basalte.re', {
      redirectTo: 'https://bertel.otisud.re/set-password?espace=1',
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      { id: 'u-new', role: 'actor', actor_id: ACTOR },
      { onConflict: 'id' },
    );
  });

  it('409 already_invited quand le compte portail de cet acteur existe déjà (invite, pas resend)', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_invited');
    expectNoAccountWrite(spies);
  });

  it('201 resend : le compte portail jamais connecté est supprimé puis ré-invité', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
      newUserId: 'portal-2',
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(201);
    expect(spies.deleteUser).toHaveBeenCalledWith('portal-1');
    expect(spies.inviteUserByEmail).toHaveBeenCalled();
    expect((await res.json()).userId).toBe('portal-2');
  });

  it('409 already_active : un compte portail déjà connecté n’est ni supprimé ni ré-invité', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: '2026-08-20T09:00:00Z' }],
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_active');
    expectNoAccountWrite(spies);
  });

  it('500 + rollback : le compte auth créé est supprimé si l’écriture du profil échoue', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      newUserId: 'u-orphan',
      upsertError: { message: 'unique violation' },
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('profile_failed');
    expect(spies.deleteUser).toHaveBeenCalledWith('u-orphan');
  });

  it('revoke : 409 et AUCUNE suppression quand le profil lié n’est pas un compte portail', async () => {
    const spies = serverStub({ linked: { id: 'staff-9', role: 'tourism_agent' } });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('no_portal_account');
    expect(spies.deleteUser).not.toHaveBeenCalled();
  });

  it('revoke : 409 quand aucun compte n’est lié à cet acteur', async () => {
    const spies = serverStub({ linked: null });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(409);
    expect(spies.deleteUser).not.toHaveBeenCalled();
  });

  it('revoke nominal : supprime le compte portail de CET acteur', async () => {
    const spies = serverStub({ linked: { id: 'portal-1', role: 'actor' } });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true });
    expect(spies.deleteUser).toHaveBeenCalledWith('portal-1');
  });

  it('status : aucun compte → account null', async () => {
    serverStub({ linked: null });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: null, linkedToOtherAccount: false });
  });

  it('status : compte portail → e-mail, date d’invitation et dernière connexion', async () => {
    serverStub({
      linked: { id: 'portal-1', role: 'actor' },
      users: [
        {
          id: 'portal-1',
          email: 'marie@basalte.re',
          last_sign_in_at: '2026-08-20T09:00:00Z',
          created_at: '2026-08-01T09:00:00Z',
        },
      ],
    });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(await res.json()).toEqual({
      account: {
        userId: 'portal-1',
        email: 'marie@basalte.re',
        invitedAt: '2026-08-01T09:00:00Z',
        lastSignInAt: '2026-08-20T09:00:00Z',
      },
      linkedToOtherAccount: false,
    });
  });

  it('status : un profil NON-acteur rattaché à cet acteur est signalé, sans divulguer son e-mail', async () => {
    const spies = serverStub({
      linked: { id: 'staff-9', role: 'tourism_agent' },
      users: [{ id: 'staff-9', email: 'agent@otisud.re', last_sign_in_at: '2026-08-01T00:00:00Z' }],
    });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    const body = await res.json();
    expect(body).toEqual({ account: null, linkedToOtherAccount: true });
    expect(spies.getUserById).not.toHaveBeenCalled();
  });

  it('409 actor_already_linked : on n’invite pas un acteur déjà rattaché à un compte non-portail', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'staff-9', role: 'tourism_agent' },
    });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('actor_already_linked');
    expectNoAccountWrite(spies);
  });

  it('422 invalid_email sur une adresse malformée', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate(true);
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_email');
    expectNoAccountWrite(spies);
  });

  it('422 quand l’acteur n’a aucun canal e-mail', async () => {
    const spies = serverStub({ channels: [] });
    gate(true);
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('email_not_actor_channel');
    expectNoAccountWrite(spies);
  });
});
