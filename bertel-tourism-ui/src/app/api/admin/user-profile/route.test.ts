/** @jest-environment node */
import { GET, PATCH } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const CALLER = 'caller-1';
const TARGET = 'target-1';

function patchReq(body: unknown, headers: Record<string, string> = { authorization: 'Bearer t' }): never {
  return {
    headers: new Headers(headers),
    json: async () => body,
    url: 'https://app.test/api/admin/user-profile',
  } as never;
}

function getReq(userId: string, headers: Record<string, string> = { authorization: 'Bearer t' }): never {
  return {
    headers: new Headers(headers),
    url: `https://app.test/api/admin/user-profile?userId=${userId}`,
  } as never;
}

/**
 * Client "en tant qu'appelant". `rpc` répond dans l'ordre des appels de la route :
 * is_platform_superuser, current_user_admin_rank, puis (si sondé) is_platform_owner.
 *
 * Le `rpc` mock est aussi exposé au niveau racine du retour (pas seulement derrière `schema()`)
 * pour que les tests puissent asserter le NOM de la sonde effectivement appelée (garde §IMPORTANT
 * 4 : un copier-coller qui swap `is_platform_owner` → `is_platform_superuser` doit faire rougir
 * un test, pas rester invisible derrière un mock ordinal).
 */
function callerProbe(opts: { isSuper?: boolean; rank?: number | null; isOwner?: boolean }) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: opts.isSuper ?? false, error: null })
    .mockResolvedValueOnce({ data: opts.rank ?? null, error: null })
    .mockResolvedValueOnce({ data: opts.isOwner ?? false, error: null });
  return { schema: () => ({ rpc }), rpc };
}

/** Valeurs par défaut du compte auth cible quand un test ne se soucie pas de son contenu. */
const DEFAULT_AUTH_USER = { email: 'target@oti.re', last_sign_in_at: null };

/**
 * Client service-role. `memberships` alimente sharesActiveOrg, `profile` la lecture du profil
 * cible, `authUser` la lecture auth.users, `actorClaims` la sonde `actor_channel` du garde-fou
 * email_claims_actor. `updateUserById` / `upsert` sont observables.
 *
 * `authUser`: omis (undefined) ⇒ compte trouvé avec des valeurs par défaut (la plupart des tests
 * ne testent pas l'existence du compte cible) ; `null` explicite ⇒ compte introuvable (404) ; un
 * objet ⇒ compte trouvé avec CES valeurs.
 * `profileError`: force `maybeSingle()` du profil cible à rendre une erreur (au lieu de `data`).
 */
function serverMock(opts: {
  memberships?: Array<{ user_id: string; org_object_id: string }>;
  profile?: { display_name: string | null; avatar_url: string | null; role: string | null } | null;
  profileError?: { message: string } | null;
  authUser?: { email: string; last_sign_in_at: string | null } | null;
  actorClaims?: Array<{ id: string }>;
  actorClaimsError?: { message: string } | null;
  updateUserById?: jest.Mock;
  upsert?: jest.Mock;
}) {
  const memberships = opts.memberships ?? [
    { user_id: CALLER, org_object_id: 'ORG1' },
    { user_id: TARGET, org_object_id: 'ORG1' },
  ];
  const upsert = opts.upsert ?? jest.fn().mockResolvedValue({ error: null });
  const from = jest.fn((table: string) => {
    if (table === 'user_org_membership') {
      return { select: () => ({ in: () => ({ eq: async () => ({ data: memberships, error: null }) }) }) };
    }
    if (table === 'actor_channel') {
      return {
        select: () => ({
          ilike: () => ({
            limit: async () => ({ data: opts.actorClaims ?? [], error: opts.actorClaimsError ?? null }),
          }),
        }),
      };
    }
    // app_user_profile
    return {
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: opts.profileError ? null : (opts.profile ?? null),
            error: opts.profileError ?? null,
          }),
        }),
      }),
      upsert,
    };
  });
  const authUserFound = opts.authUser !== null;
  return {
    __upsert: upsert,
    from,
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } }, error: null }),
      admin: {
        getUserById: jest.fn().mockResolvedValue(
          authUserFound
            ? { data: { user: { id: TARGET, ...(opts.authUser ?? DEFAULT_AUTH_USER) } }, error: null }
            : { data: { user: null }, error: { message: 'not found' } },
        ),
        updateUserById: opts.updateUserById ?? jest.fn().mockResolvedValue({ data: {}, error: null }),
      },
    },
  };
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

describe('GET /api/admin/user-profile', () => {
  it('401 sans jeton', async () => {
    mockedServer.mockReturnValue({ auth: {} } as never);
    expect((await GET(getReq(TARGET, {}))).status).toBe(401);
  });

  it('rend le profil complet du membre', async () => {
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: 'https://cdn/a.jpg', role: 'tourism_agent' },
      authUser: { email: 'alice@oti.re', last_sign_in_at: null },
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await GET(getReq(TARGET));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      displayName: 'Alice',
      avatarUrl: 'https://cdn/a.jpg',
      email: 'alice@oti.re',
      platformRole: 'tourism_agent',
      lastSignInAt: null,
    });
  });

  it('404 quand le compte auth n’existe pas', async () => {
    mockedServer.mockReturnValue(serverMock({ profile: null, authUser: null }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    expect((await GET(getReq(TARGET))).status).toBe(404);
  });

  it('403 hors périmètre pour un admin d’ORG non superuser', async () => {
    mockedServer.mockReturnValue(serverMock({
      memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
      profile: { display_name: 'Bob', avatar_url: null, role: null },
      authUser: { email: 'bob@ailleurs.re', last_sign_in_at: null },
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await GET(getReq(TARGET));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('out_of_scope');
  });
});

describe('PATCH /api/admin/user-profile', () => {
  it('403 quand la cible est l’appelant lui-même', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: CALLER, displayName: 'Moi' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_edit_forbidden');
  });

  it('403 hors périmètre pour un admin d’ORG non superuser', async () => {
    mockedServer.mockReturnValue(serverMock({
      memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, displayName: 'Bob' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('out_of_scope');
  });

  it('422 sur une clé de payload inconnue', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, langPrefs: ['fr'] }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('unknown_field');
  });

  it('422 sur une adresse invalide', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'pas-une-adresse' }));
    expect(res.status).toBe(422);
  });

  it('403 owner_required : un superuser NON owner ne peut pas attribuer super_admin', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
    }) as never);
    const probe = callerProbe({ isSuper: true, isOwner: false });
    mockedCreate.mockReturnValue(probe as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'super_admin' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('owner_required');
    expect(upsert).not.toHaveBeenCalled();
    // Asserte le NOM de la sonde : un copier-coller vers is_platform_superuser laisserait ce
    // test vert alors que la garde serait fail-open (§IMPORTANT 4).
    expect(probe.rpc).toHaveBeenCalledWith('is_platform_owner');
  });

  it('403 owner_required : retirer un rôle privilégié exige aussi owner', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'super_admin' },
      upsert,
    }) as never);
    const probe = callerProbe({ isSuper: true, isOwner: false });
    mockedCreate.mockReturnValue(probe as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'tourism_agent' }));
    expect(res.status).toBe(403);
    expect(upsert).not.toHaveBeenCalled();
    expect(probe.rpc).toHaveBeenCalledWith('is_platform_owner');
  });

  it('200 : un owner attribue super_admin', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
    }) as never);
    const probe = callerProbe({ isSuper: true, isOwner: true });
    mockedCreate.mockReturnValue(probe as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'super_admin' }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ id: TARGET, role: 'super_admin' }, { onConflict: 'id' });
    expect(probe.rpc).toHaveBeenCalledWith('is_platform_owner');
  });

  it('500 quand la lecture du profil cible échoue (owner_required ne doit pas devenir fail-open)', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({
      profileError: { message: 'boom' },
      upsert,
    }) as never);
    const probe = callerProbe({ isSuper: true, isOwner: false });
    mockedCreate.mockReturnValue(probe as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'tourism_agent' }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('profile_read_failed');
    expect(upsert).not.toHaveBeenCalled();
    // La sonde owner n'est même pas atteinte : l'échec de lecture coupe AVANT, jamais après.
    expect(probe.rpc).not.toHaveBeenCalledWith('is_platform_owner');
  });

  it('422 sur un rôle plateforme inconnu, aucune écriture', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    mockedServer.mockReturnValue(serverMock({ upsert }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, platformRole: 'role_invente' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_platform_role');
    expect(upsert).not.toHaveBeenCalled();
  });

  it('404 quand le compte cible n’existe pas côté auth, aucune écriture', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const updateUserById = jest.fn();
    mockedServer.mockReturnValue(serverMock({
      authUser: null,
      upsert,
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, displayName: 'Bob' }));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('user_not_found');
    expect(upsert).not.toHaveBeenCalled();
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('409 email_taken quand l’adresse est déjà prise par un autre compte', async () => {
    const updateUserById = jest.fn().mockResolvedValue({
      data: null,
      error: { message: 'Email address already registered' },
    });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'prise@oti.re' }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken');
  });

  it('403 email_claims_actor : un admin de rang 30 ne peut pas rattacher l’adresse d’un prestataire', async () => {
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      updateUserById,
      actorClaims: [{ id: 'ac-1' }],
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'prestataire@ext.re' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('email_claims_actor');
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('200 : un superuser PEUT rattacher l’adresse d’un prestataire (la garde ne coupe pas qui a le droit)', async () => {
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      updateUserById,
      actorClaims: [{ id: 'ac-1' }],
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'prestataire@ext.re' }));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(TARGET, { email: 'prestataire@ext.re', email_confirm: true });
  });

  it('403 anti-self insensible à la casse', async () => {
    mockedServer.mockReturnValue(serverMock({}) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: CALLER.toUpperCase(), displayName: 'Moi' }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('self_edit_forbidden');
  });

  it('500 profile_update_failed signale que l’e-mail a déjà changé quand l’upsert échoue ensuite', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: { message: 'db down' } });
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'nouvelle@oti.re', displayName: 'Alice M' }));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe('profile_update_failed');
    expect(body.detail).toMatch(/adresse de connexion a déjà été changée/);
  });

  it('200 : renomme sans toucher au rôle ni à l’e-mail', async () => {
    const upsert = jest.fn().mockResolvedValue({ error: null });
    const updateUserById = jest.fn();
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      upsert,
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: false, rank: 30 }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, displayName: '  Alice Martin  ' }));
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledWith({ id: TARGET, display_name: 'Alice Martin' }, { onConflict: 'id' });
    expect(updateUserById).not.toHaveBeenCalled();
  });

  it('200 : change l’e-mail de connexion sans courriel de confirmation', async () => {
    const updateUserById = jest.fn().mockResolvedValue({ data: {}, error: null });
    mockedServer.mockReturnValue(serverMock({
      profile: { display_name: 'Alice', avatar_url: null, role: 'tourism_agent' },
      updateUserById,
    }) as never);
    mockedCreate.mockReturnValue(callerProbe({ isSuper: true }) as never);
    const res = await PATCH(patchReq({ userId: TARGET, email: 'Nouvelle@OTI.re' }));
    expect(res.status).toBe(200);
    expect(updateUserById).toHaveBeenCalledWith(TARGET, { email: 'nouvelle@oti.re', email_confirm: true });
  });
});
