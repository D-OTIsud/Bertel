/** @jest-environment node */
import { POST } from './route';

// Gabarit du dépôt pour une route service-role (§164 : src/app/api/admin/invite/route.test.ts) :
// on mocke `@/lib/supabase-server` (le client service_role) ET `@supabase/supabase-js`
// (`createClient`, qui fabrique le client « en tant qu'appelant » de `_document-auth`).
// Les deux mocks sont ce qui rend visible LA question de cette route : QUI évalue le gate.
//
// ⚠ LE STUB ASSERTE SES ARGUMENTS. Une première version rendait `eq: () => …` en ignorant
// (colonne, valeur) : retirer `.eq('actor_id', actorId)` de la route laissait les 25 tests
// verts, alors que `revoke` supprimait le PREMIER profil `role='actor'` de la table, quel
// que soit l'acteur affiché. Un stub qui ignore ses arguments transforme une garde en décor.
jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreateClient = jest.mocked(createClient);

const ACTOR = '11111111-1111-4111-8111-111111111111';

function req(headers: Record<string, string>, body: unknown): never {
  return {
    headers: new Headers(headers),
    json: async () => body,
    url: 'https://app.test/api/crm/actor-access',
  } as never;
}

/* ─── Client « en tant qu'appelant » ─────────────────────────────────────────────────── */

interface GateOptions {
  portal?: boolean | null;
  portalError?: unknown;
  read?: boolean | null;
  write?: boolean | null;
  /** Erreur rendue par les DEUX prédicats de gate (jamais par la trace). */
  gateError?: unknown;
  /** Erreur rendue par `save_crm_interaction`. */
  traceError?: unknown;
}

/**
 * Répond PAR NOM DE RPC. Un gate qui interrogerait le mauvais prédicat (lecture au lieu
 * d'écriture) se voit donc immédiatement : l'autre nom rend la valeur de l'autre colonne.
 */
function gate(options: GateOptions = { read: true, write: true }) {
  const rpc = jest.fn(async (name: string) => {
    if (name === 'current_user_can_manage_actor_portal') {
      return { data: options.portal === undefined ? true : options.portal, error: options.portalError ?? null };
    }
    if (name === 'user_can_read_crm_actor') {
      return { data: options.read ?? null, error: options.gateError ?? null };
    }
    if (name === 'user_can_write_crm_actor') {
      return { data: options.write ?? null, error: options.gateError ?? null };
    }
    if (name === 'save_crm_interaction') {
      return { data: { id: 'int-1' }, error: options.traceError ?? null };
    }
    throw new Error(`RPC inattendu : ${name}`);
  });
  const schema = jest.fn(() => ({ rpc }));
  mockedCreateClient.mockReturnValue({ schema } as never);
  return { rpc, schema };
}

/** Les appels au gate, dans l'ordre : [nom du prédicat, arguments]. */
function gateCalls(rpc: jest.Mock): Array<[string, unknown]> {
  return rpc.mock.calls
    .filter(([name]) => name !== 'save_crm_interaction')
    .map(([name, args]) => [name as string, args]);
}

/** Les appels de trace CRM, dans l'ordre. */
function traceCalls(rpc: jest.Mock): unknown[] {
  return rpc.mock.calls.filter(([name]) => name === 'save_crm_interaction').map(([, args]) => args);
}

/* ─── Client service_role ────────────────────────────────────────────────────────────── */

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
  /** Erreur de LECTURE sur `app_user_profile`. */
  linkedError?: { message: string } | null;
  /** Comptes `auth.users` connus. */
  users?: StubUser[];
  newUserId?: string;
  inviteError?: { message: string } | null;
  upsertError?: { message: string } | null;
  /** Aucun kind `email` au référentiel (fail-closed de `actorEmailChannels`). */
  missingKind?: boolean;
}

/** Un appel à `from(table)` et les arguments réellement passés à la chaîne. */
interface FromCall {
  table: string;
  select: unknown[];
  eq: Array<[string, unknown]>;
}

/**
 * Nœud de requête PostgREST simulé. `eq` MÉMORISE (colonne, valeur) et le `then` le rend
 * awaitable — `actorEmailChannels` termine sa chaîne sur `.eq()` sans `.maybeSingle()`.
 */
function queryNode(call: FromCall, result: unknown) {
  const node: Record<string, unknown> = {};
  Object.assign(node, {
    select: (columns?: unknown) => {
      call.select.push(columns);
      return node;
    },
    eq: (column: string, value: unknown) => {
      call.eq.push([column, value]);
      return node;
    },
    limit: () => node,
    maybeSingle: async () => result,
    then: (onOk: (value: unknown) => unknown, onErr?: (reason: unknown) => unknown) =>
      Promise.resolve(result).then(onOk, onErr),
  });
  return node;
}

function serverStub(options: StubOptions = {}) {
  const users = options.users ?? [];
  const fromCalls: FromCall[] = [];

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
    const call: FromCall = { table, select: [], eq: [] };
    fromCalls.push(call);
    if (table === 'ref_code_contact_kind') {
      return queryNode(call, { data: options.missingKind ? null : { id: 'kind-email' }, error: null });
    }
    if (table === 'actor_channel') {
      return queryNode(call, { data: (options.channels ?? []).map((value) => ({ value })), error: null });
    }
    if (table === 'app_user_profile') {
      const node = queryNode(call, { data: options.linked ?? null, error: options.linkedError ?? null });
      (node as Record<string, unknown>).upsert = upsert;
      return node;
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

  return { inviteUserByEmail, listUsers, deleteUser, getUserById, upsert, from, fromCalls };
}

/** Aucune écriture de compte n'a eu lieu — l'assertion qui donne du mordant aux refus. */
function expectNoAccountWrite(spies: ReturnType<typeof serverStub>) {
  expect(spies.inviteUserByEmail).not.toHaveBeenCalled();
  expect(spies.deleteUser).not.toHaveBeenCalled();
  expect(spies.upsert).not.toHaveBeenCalled();
}

/** La chaîne réellement émise sur une table (table + colonnes + filtres). */
function callOn(spies: ReturnType<typeof serverStub>, table: string): FromCall | undefined {
  return spies.fromCalls.find((call) => call.table === table);
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreateClient.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  delete process.env.NEXT_PUBLIC_APP_URL;
});

describe('POST /api/crm/actor-access — identité et gate', () => {
  it.each(['status', 'invite', 'resend', 'revoke'])('%s exige la permission dédiée malgré les droits CRM', async (action) => {
    for (const denial of [{ portal: false }, { portal: null }, { portal: true, portalError: { message: 'unavailable' } }]) {
      const spies = serverStub({ linked: { id: 'portal-1', role: 'actor' } });
      const { rpc } = gate({ read: true, write: true, ...denial });
      const res = await POST(req({ authorization: 'Bearer t' }, { action, actorId: ACTOR, email: 'marie@basalte.re' }));
      expect(res.status).toBe(403);
      expect((await res.json()).error).toBe('portal_access_forbidden');
      expect(gateCalls(rpc)).toEqual([['current_user_can_manage_actor_portal', undefined]]);
      expect(spies.from).not.toHaveBeenCalled();
      expect(spies.getUserById).not.toHaveBeenCalled();
      expect(spies.listUsers).not.toHaveBeenCalled();
      expectNoAccountWrite(spies);
    }
  });

  it('401 sans Bearer — et rien n’est lu en base', async () => {
    const spies = serverStub();
    const res = await POST(req({}, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(401);
    expect(spies.from).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  // CRITIQUE 2 — un test par verbe. Le gate est UNIQUE et placé avant l'aiguillage : c'est le
  // bon design, mais il rend une régression PARTIELLE invisible si un seul verbe est exercé.
  // Déplacer le `if (gateErr || canAct !== true)` après le bloc status/revoke ouvrirait la
  // suppression de compte à tout compte authentifié — ces quatre cas le referment.
  const REFUSALS: Array<{ action: string; body: Record<string, unknown>; forbids: 'read' | 'write' }> = [
    { action: 'status', body: {}, forbids: 'read' },
    { action: 'invite', body: { email: 'marie@basalte.re' }, forbids: 'write' },
    { action: 'resend', body: { email: 'marie@basalte.re' }, forbids: 'write' },
    { action: 'revoke', body: {}, forbids: 'write' },
  ];

  it.each(REFUSALS)('403 sur « $action » quand le prédicat rend false — rien n’est lu, rien n’est écrit', async ({ action, body, forbids }) => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      // Un compte portail EXISTE : sans le gate, `revoke` aurait quelque chose à supprimer.
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
    });
    const { rpc } = gate({ read: forbids !== 'read', write: forbids !== 'write' });
    const res = await POST(req({ authorization: 'Bearer t' }, { action, actorId: ACTOR, ...body }));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('forbidden');
    // Le gate PRÉCÈDE toute lecture : un refus ne doit pas même avoir touché app_user_profile.
    expect(spies.from).not.toHaveBeenCalled();
    expect(spies.getUserById).not.toHaveBeenCalled();
    expect(spies.listUsers).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
    // Et aucune trace CRM n'est écrite pour un geste refusé.
    expect(traceCalls(rpc)).toHaveLength(0);
  });

  it('chaque verbe interroge LE prédicat qui lui correspond (lecture pour status, écriture pour les trois autres)', async () => {
    for (const { action, body, forbids } of REFUSALS) {
      serverStub({ channels: ['marie@basalte.re'], linked: null });
      const { rpc } = gate({ read: true, write: true });
      await POST(req({ authorization: 'Bearer t' }, { action, actorId: ACTOR, ...body }));
      expect(gateCalls(rpc)).toEqual([
        ['current_user_can_manage_actor_portal', undefined],
        [forbids === 'read' ? 'user_can_read_crm_actor' : 'user_can_write_crm_actor', { p_actor_id: ACTOR }],
      ]);
    }
  });

  it('403 fail-closed quand le gate est en erreur (jamais « on laisse passer »)', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate({ read: true, write: true, gateError: { message: 'boom' } });
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(403);
    expectNoAccountWrite(spies);
  });

  it('403 fail-closed quand le gate rend NULL (hors contexte HTTP — les prédicats n’ont pas de COALESCE)', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate({ read: null, write: null });
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(403);
    expectNoAccountWrite(spies);
  });

  it('le gate est évalué EN TANT QUE L’APPELANT (clé ANON + son JWT), jamais avec la service key', async () => {
    serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    const { rpc, schema } = gate();
    await POST(req({ authorization: 'Bearer jwt-agent' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }));
    expect(mockedCreateClient).toHaveBeenCalledWith(
      'https://x.supabase.co',
      'anon-key',
      expect.objectContaining({ global: { headers: { Authorization: 'Bearer jwt-agent' } } }),
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
});

// CRITIQUE 1 — sans ces assertions, retirer `.eq('actor_id', …)` laissait toute la suite verte
// pendant que `revoke` supprimait le premier compte portail venu.
describe('POST /api/crm/actor-access — les requêtes visent CET acteur, et lui seul', () => {
  it('le profil lié est cherché par actor_id = l’acteur demandé', async () => {
    const spies = serverStub({ linked: { id: 'portal-1', role: 'actor' } });
    gate();
    await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    const profile = callOn(spies, 'app_user_profile');
    expect(profile).toBeDefined();
    expect(profile?.select).toEqual(['id, role']);
    expect(profile?.eq).toEqual([['actor_id', ACTOR]]);
  });

  it('les canaux e-mail sont ceux de l’acteur demandé, filtrés sur le kind « email »', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate();
    await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(callOn(spies, 'ref_code_contact_kind')?.eq).toEqual([['code', 'email']]);
    expect(callOn(spies, 'actor_channel')?.eq).toEqual([
      ['actor_id', ACTOR],
      ['kind_id', 'kind-email'],
    ]);
  });

  it('les seules tables touchées sont celles attendues', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate();
    await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(spies.fromCalls.map((call) => call.table)).toEqual([
      'app_user_profile',
      'ref_code_contact_kind',
      'actor_channel',
      'app_user_profile',
    ]);
  });

  it('500 quand la lecture du profil échoue — jamais un « aucun compte » déguisé', async () => {
    const spies = serverStub({ linkedError: { message: 'timeout' } });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('profile_read_failed');
    expect(spies.getUserById).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/actor-access — invitation', () => {
  it('201 nominal : e-mail vers /set-password?espace=1 + profil {role actor, actor_id} + trace CRM', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    const { rpc } = gate();
    process.env.NEXT_PUBLIC_APP_URL = 'https://bertel.otisud.re';
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'Marie@Basalte.re ' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ userId: 'u-new', traced: true });
    // `?espace=1` : SANS lui, /set-password parle au partenaire comme au personnel de l'office.
    expect(spies.inviteUserByEmail).toHaveBeenCalledWith('marie@basalte.re', {
      redirectTo: 'https://bertel.otisud.re/set-password?espace=1',
    });
    expect(spies.upsert).toHaveBeenCalledWith(
      { id: 'u-new', role: 'actor', actor_id: ACTOR },
      { onConflict: 'id' },
    );
    // IMPORTANT 7 — création et suppression de comptes laissent une trace nominative.
    expect(traceCalls(rpc)).toEqual([
      {
        p_payload: {
          actor_id: ACTOR,
          subject: 'Accès portail ouvert',
          body: expect.stringContaining('marie@basalte.re'),
        },
      },
    ]);
  });

  // IMPORTANT 6 — §164 dérivait l'origine de l'en-tête `Origin`, mais réservait le geste au rang
  // plateforme. Ici la population est « qui a write_crm_notes sur cet acteur » : un en-tête
  // choisi par l'appelant ferait pointer le lien porteur du jeton vers son propre hôte.
  it('l’origine du lien vient de la configuration serveur, JAMAIS de l’en-tête Origin', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate();
    process.env.NEXT_PUBLIC_APP_URL = 'https://bertel.otisud.re';
    await POST(
      req(
        { authorization: 'Bearer t', origin: 'https://attaquant.example' },
        { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' },
      ),
    );
    expect(spies.inviteUserByEmail).toHaveBeenCalledWith('marie@basalte.re', {
      redirectTo: 'https://bertel.otisud.re/set-password?espace=1',
    });
  });

  it('sans configuration, l’origine vient de l’URL de la requête — toujours pas de l’en-tête Origin', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate();
    await POST(
      req(
        { authorization: 'Bearer t', origin: 'https://attaquant.example' },
        { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' },
      ),
    );
    expect(spies.inviteUserByEmail).toHaveBeenCalledWith('marie@basalte.re', {
      redirectTo: 'https://app.test/set-password?espace=1',
    });
  });

  it('422 quand l’e-mail n’est PAS un canal de CET acteur', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'intrus@ailleurs.re' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('email_not_actor_channel');
    expect(spies.listUsers).not.toHaveBeenCalled();
    expectNoAccountWrite(spies);
  });

  it('422 quand l’acteur n’a aucun canal e-mail', async () => {
    const spies = serverStub({ channels: [] });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('email_not_actor_channel');
    expectNoAccountWrite(spies);
  });

  it('422 fail-closed quand le kind « email » est introuvable au référentiel', async () => {
    // Sans le repli `if (!kindId) return []`, la requête `actor_channel` partirait avec un
    // kind_id undefined et le verrou d'adresse tomberait — c'est ce cas qui le prouve.
    const spies = serverStub({ channels: ['marie@basalte.re'], missingKind: true });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('email_not_actor_channel');
    expect(callOn(spies, 'actor_channel')).toBeUndefined();
    expectNoAccountWrite(spies);
  });

  it('422 invalid_email sur une adresse malformée', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'] });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie' }));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('invalid_email');
    expectNoAccountWrite(spies);
  });

  it('409 email_taken_by_staff : l’adresse est un canal de l’acteur mais un AUTRE compte la porte déjà', async () => {
    // Le compte trouvé peut être un agent de l'office OU le portail d'un autre acteur — la
    // route ne peut pas (et n'a pas à) les distinguer : dans les deux cas l'adresse est prise.
    const spies = serverStub({
      channels: ['agent@otisud.re'],
      linked: null,
      users: [{ id: 'staff-1', email: 'agent@otisud.re', last_sign_in_at: '2026-08-01T00:00:00Z' }],
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'agent@otisud.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('email_taken_by_staff');
    expectNoAccountWrite(spies);
  });

  it('409 already_invited quand le compte portail de cet acteur existe déjà (même adresse)', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_invited');
    expectNoAccountWrite(spies);
  });

  // IMPORTANT 4 — le parcours qui envoyait l'e-mail POUR DE BON avant de détruire le compte.
  it('409 already_invited AVANT tout envoi quand on invite une SECONDE adresse d’un acteur déjà pourvu', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re', 'contact@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
      newUserId: 'u-second',
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'contact@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_invited');
    // L'e-mail ne part PAS : sans ce refus, l'upsert violait l'index unique, le rollback
    // supprimait le compte, et le partenaire recevait un lien vers un compte détruit.
    expectNoAccountWrite(spies);
  });

  it('409 actor_already_linked : on n’invite pas un acteur déjà rattaché à un compte non-portail', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'staff-9', role: 'tourism_agent' },
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('actor_already_linked');
    expectNoAccountWrite(spies);
  });

  it('500 + rollback : le compte auth créé est supprimé si l’écriture du profil échoue', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      newUserId: 'u-orphan',
      upsertError: { message: 'unique violation' },
    });
    const { rpc } = gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(500);
    const payload = await res.json();
    expect(payload.error).toBe('profile_failed');
    // Le détail brut de PostgREST (jusqu'au nom de contrainte) ne redescend PAS au client.
    expect(payload.detail).toBeUndefined();
    expect(spies.deleteUser).toHaveBeenCalledWith('u-orphan');
    expect(traceCalls(rpc)).toHaveLength(0);
  });

  it('201 traced:false quand la trace CRM échoue — le compte, lui, est bien créé', async () => {
    serverStub({ channels: ['marie@basalte.re'], newUserId: 'u-new' });
    gate({ read: true, write: true, traceError: { message: 'rls' } });
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'invite', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ userId: 'u-new', traced: false });
  });
});

describe('POST /api/crm/actor-access — renvoi', () => {
  it('201 : le compte portail jamais connecté est supprimé PAR SON ID puis ré-invité, avec trace', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
      newUserId: 'portal-2',
    });
    const { rpc } = gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(201);
    expect(spies.deleteUser).toHaveBeenCalledWith('portal-1');
    // La cible vient de `portal.id`, jamais d'une recherche par e-mail.
    expect(spies.listUsers).not.toHaveBeenCalled();
    expect((await res.json()).userId).toBe('portal-2');
    expect(traceCalls(rpc)).toEqual([
      { p_payload: { actor_id: ACTOR, subject: 'Invitation au portail renvoyée', body: expect.any(String) } },
    ]);
  });

  // Le message d'échec doit être vrai AU MOMENT OÙ L'AGENT LE LIT. Sur `invite`, rien n'a
  // bougé ; sur `resend`, un compte vient d'être détruit — « aucun compte n'a été créé »
  // laisserait croire que l'accès existant est intact.
  it('500 resend_lost_previous quand l’invitation échoue APRÈS la fermeture de l’ancien compte', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
      inviteError: { message: 'smtp down' },
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('resend_lost_previous');
    // L'ancien compte est bel et bien parti : c'est ce qui rend « create_failed » mensonger ici.
    expect(spies.deleteUser).toHaveBeenCalledWith('portal-1');
  });

  it('500 resend_lost_previous quand le profil échoue sur un renvoi — l’acteur n’a plus aucun accès', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
      newUserId: 'portal-2',
      upsertError: { message: 'unique violation' },
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('resend_lost_previous');
    expect(spies.deleteUser).toHaveBeenNthCalledWith(1, 'portal-1');
    expect(spies.deleteUser).toHaveBeenNthCalledWith(2, 'portal-2');
  });

  it('500 resend_failed quand la fermeture elle-même échoue — là, rien n’a bougé', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
    });
    spies.deleteUser.mockResolvedValue({ error: { message: 'gotrue down' } });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('resend_failed');
    expect(spies.inviteUserByEmail).not.toHaveBeenCalled();
  });

  it('409 already_active : un compte portail déjà connecté n’est ni supprimé ni ré-invité', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: '2026-08-20T09:00:00Z' }],
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_active');
    expectNoAccountWrite(spies);
  });

  it('409 : renvoyer à une AUTRE adresse que celle du compte n’est pas un renvoi', async () => {
    const spies = serverStub({
      channels: ['marie@basalte.re', 'contact@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }],
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'contact@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('already_invited');
    expectNoAccountWrite(spies);
  });

  it('409 no_portal_account : sans compte portail, « renvoyer » ne se comporte PAS comme « inviter »', async () => {
    const spies = serverStub({ channels: ['marie@basalte.re'], linked: null, newUserId: 'u-new' });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'marie@basalte.re' }),
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('no_portal_account');
    expectNoAccountWrite(spies);
  });

  it('un compte de l’office qui porte l’adresse n’est JAMAIS supprimé par un renvoi', async () => {
    // L'adresse de l'agent est un canal de l'acteur ET l'acteur a son propre compte ailleurs :
    // la cible de `deleteUser` reste `portal.id`, l'agent est hors d'atteinte par construction.
    const spies = serverStub({
      channels: ['agent@otisud.re', 'marie@basalte.re'],
      linked: { id: 'portal-1', role: 'actor' },
      users: [
        { id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null },
        { id: 'staff-1', email: 'agent@otisud.re', last_sign_in_at: null },
      ],
    });
    gate();
    const res = await POST(
      req({ authorization: 'Bearer t' }, { action: 'resend', actorId: ACTOR, email: 'agent@otisud.re' }),
    );
    expect(res.status).toBe(409);
    expect(spies.deleteUser).not.toHaveBeenCalled();
  });
});

describe('POST /api/crm/actor-access — révocation', () => {
  it('409 et AUCUNE suppression quand le profil lié n’est pas un compte portail', async () => {
    const spies = serverStub({ linked: { id: 'staff-9', role: 'tourism_agent' } });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('no_portal_account');
    expect(spies.deleteUser).not.toHaveBeenCalled();
  });

  it('409 quand aucun compte n’est lié à cet acteur', async () => {
    const spies = serverStub({ linked: null });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(409);
    expect(spies.deleteUser).not.toHaveBeenCalled();
  });

  it('nominal : supprime le compte portail de CET acteur et trace le geste avec l’adresse fermée', async () => {
    const spies = serverStub({
      linked: { id: 'portal-1', role: 'actor' },
      users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: '2026-08-20T09:00:00Z' }],
    });
    const { rpc } = gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'revoke', actorId: ACTOR }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revoked: true, traced: true });
    expect(spies.deleteUser).toHaveBeenCalledWith('portal-1');
    expect(traceCalls(rpc)).toEqual([
      {
        p_payload: {
          actor_id: ACTOR,
          subject: 'Accès portail révoqué',
          body: expect.stringContaining('marie@basalte.re'),
        },
      },
    ]);
  });
});

describe('POST /api/crm/actor-access — statut', () => {
  it('aucun compte → account null', async () => {
    serverStub({ linked: null });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ account: null, linkedToOtherAccount: false });
  });

  it('compte portail → e-mail, date d’invitation et dernière connexion', async () => {
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
    gate();
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

  it('un profil NON-acteur rattaché à cet acteur est signalé, sans divulguer son e-mail', async () => {
    const spies = serverStub({
      linked: { id: 'staff-9', role: 'tourism_agent' },
      users: [{ id: 'staff-9', email: 'agent@otisud.re', last_sign_in_at: '2026-08-01T00:00:00Z' }],
    });
    gate();
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(await res.json()).toEqual({ account: null, linkedToOtherAccount: true });
    expect(spies.getUserById).not.toHaveBeenCalled();
  });

  // IMPORTANT 3 — un agent en lecture seule (canWrite=false côté front) DOIT pouvoir lire ce
  // statut : sinon la carte affiche un bandeau d'alerte permanent sur chaque fiche, et sa
  // branche « lecture seule » n'est jamais atteinte en production.
  it('un agent sans droit d’écriture lit quand même le statut', async () => {
    serverStub({ linked: { id: 'portal-1', role: 'actor' }, users: [{ id: 'portal-1', email: 'marie@basalte.re', last_sign_in_at: null }] });
    gate({ read: true, write: false });
    const res = await POST(req({ authorization: 'Bearer t' }, { action: 'status', actorId: ACTOR }));
    expect(res.status).toBe(200);
    expect((await res.json()).account.email).toBe('marie@basalte.re');
  });
});
