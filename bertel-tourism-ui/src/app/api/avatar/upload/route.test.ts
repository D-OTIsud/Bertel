/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../media/upload/process-image', () => ({
  processImage: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
  MediaProcessingError: class extends Error {},
}));
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);

const CALLER = 'caller-1';
const TARGET = 'target-1';
// MINEUR (revue finale) — le mock `getUserById` rendait EXACTEMENT l'identifiant envoyé par le
// formulaire : une régression qui ré-introduirait `userId = target` (chaîne cliente brute) sur le
// bras admin au lieu de `authTarget.user.id` (valeur canonique GoTrue) ne ferait alors rougir
// AUCUN test — c'est précisément la régression réellement survenue pendant ce chantier (cf. le
// test "casse différente" du bras "soi-même" plus bas, qui l'éprouve déjà pour l'autre branche).
// Une casse DIFFÉRENTE du posté force le chemin storage/upsert à ne pouvoir provenir QUE du GoTrue.
const TARGET_CANONICAL = TARGET.toUpperCase();

function file(): File {
  return new File([new Uint8Array([1, 2, 3])], 'a.jpg', { type: 'image/jpeg' });
}

function req(fields: Record<string, string> = {}): never {
  const form = new FormData();
  form.append('file', file());
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return {
    headers: new Headers({ authorization: 'Bearer t' }),
    formData: async () => form,
    url: 'https://app.test/api/avatar/upload',
  } as never;
}

function serverMock(opts: {
  memberships?: Array<{ user_id: string; org_object_id: string }>;
  update?: jest.Mock;
  getUserById?: jest.Mock;
}) {
  const memberships = opts.memberships ?? [
    { user_id: CALLER, org_object_id: 'ORG1' },
    { user_id: TARGET, org_object_id: 'ORG1' },
  ];
  const update = opts.update ?? jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  // upsert et upload sont hissés dans la fabrique (comme __update l'était déjà) : storage.from()
  // rend un objet NEUF à chaque appel dans l'implémentation d'origine, donc sans ce hissage
  // l'espion n'est observable par AUCUN test — cf. constat de revue « aucun fichier écrit n'est
  // asserté nulle part ».
  const upsert = jest.fn().mockResolvedValue({ error: null });
  const upload = jest.fn().mockResolvedValue({ error: null });
  const getUserById =
    opts.getUserById ?? jest.fn().mockResolvedValue({ data: { user: { id: TARGET_CANONICAL } }, error: null });
  return {
    __update: update,
    __upsert: upsert,
    __upload: upload,
    auth: {
      getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } }, error: null }),
      admin: { getUserById },
    },
    from: jest.fn((table: string) =>
      table === 'user_org_membership'
        ? { select: () => ({ in: () => ({ eq: async () => ({ data: memberships, error: null }) }) }) }
        : { update, upsert },
    ),
    storage: {
      from: () => ({
        upload,
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    },
  };
}

/** Sonde d'autorisation admin : isSuper puis rank, dans CET ordre (Promise.all évalue les deux
 * appels `.rpc(...)` avant de les attendre — cf. `authorizeAdminRoute`). `rpc` doit être déclaré
 * HORS de la fabrique `schema()` : `schema('api')` est appelé une fois par élément du tableau, et
 * une fabrique qui recrée `rpc` à chaque appel perdrait la file `mockResolvedValueOnce`. */
function adminProbeMock(isSuper: boolean, rank: number) {
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: isSuper, error: null })
    .mockResolvedValueOnce({ data: rank, error: null });
  return { schema: () => ({ rpc }) } as never;
}

beforeEach(() => {
  mockedServer.mockReset();
  mockedCreate.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

it('sans targetUserId : écrit son propre avatar, persisté en tant qu’appelant', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  const asCallerUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  mockedCreate.mockReturnValue({ from: () => ({ update: asCallerUpdate }) } as never);

  const res = await POST(req());
  expect(res.status).toBe(201);
  expect((await res.json()).url).toContain(`${CALLER}/avatar.jpg`);
  expect(asCallerUpdate).toHaveBeenCalled();
  expect(server.__update).not.toHaveBeenCalled();
  expect(server.__upsert).not.toHaveBeenCalled();
});

it.each(['', '   '])(
  'targetUserId vide ou blanc (%j) : reste le bras "soi-même"',
  async (blank) => {
    const server = serverMock({});
    mockedServer.mockReturnValue(server as never);
    const asCallerUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    mockedCreate.mockReturnValue({ from: () => ({ update: asCallerUpdate }) } as never);

    const res = await POST(req({ targetUserId: blank }));
    expect(res.status).toBe(201);
    expect((await res.json()).url).toContain(`${CALLER}/avatar.jpg`);
    expect(asCallerUpdate).toHaveBeenCalled();
    // Le bras admin (authorizeAdminRoute, sonde rang/scope) ne doit pas être emprunté.
    expect(server.__upsert).not.toHaveBeenCalled();
  },
);

it('targetUserId d’un admin d’ORG (rang 30, non superuser) sur un membre de la même ORG : chemin de la CIBLE, persisté en upsert service-role', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  // isSuper=false, rank=30 : l'admission ne peut passer QUE par sharesActiveOrg (memberships
  // partagent ORG1) — sans quoi ce test resterait vacant sur le chemin qui justifie la
  // fonctionnalité (cf. constat de revue « le test du bras admin est VACANT »).
  mockedCreate.mockReturnValue(adminProbeMock(false, 30));

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(201);
  // Valeur CANONIQUE (getUserById), jamais la chaîne cliente `TARGET` — cf. TARGET_CANONICAL.
  expect((await res.json()).url).toContain(`${TARGET_CANONICAL}/avatar.jpg`);
  expect(server.__upsert).toHaveBeenCalledWith(
    { id: TARGET_CANONICAL, avatar_url: expect.stringContaining(`${TARGET_CANONICAL}/avatar.jpg`) },
    { onConflict: 'id' },
  );
  expect(server.__update).not.toHaveBeenCalled();
});

it('targetUserId avec un superuser plateforme : chemin de la CIBLE, persisté en upsert service-role', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  mockedCreate.mockReturnValue(adminProbeMock(true, 0));

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(201);
  // Valeur CANONIQUE (getUserById), jamais la chaîne cliente `TARGET` — cf. TARGET_CANONICAL.
  expect((await res.json()).url).toContain(`${TARGET_CANONICAL}/avatar.jpg`);
  expect(server.__upsert).toHaveBeenCalledWith(
    { id: TARGET_CANONICAL, avatar_url: expect.stringContaining(`${TARGET_CANONICAL}/avatar.jpg`) },
    { onConflict: 'id' },
  );
});

it('targetUserId hors périmètre : 403, aucun fichier écrit', async () => {
  const server = serverMock({
    memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
  });
  mockedServer.mockReturnValue(server as never);
  mockedCreate.mockReturnValue(adminProbeMock(false, 30));

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe('out_of_scope');
  // L'exigence la plus dure de cette tâche : un fichier écrit PUIS refusé est déjà un dépôt non
  // autorisé. La garde doit s'exécuter AVANT tout upload, jamais après.
  expect(server.__upload).not.toHaveBeenCalled();
});

it('targetUserId superuser mais cible inexistante : 404, aucun fichier écrit', async () => {
  const server = serverMock({
    getUserById: jest.fn().mockResolvedValue({ data: { user: null }, error: null }),
  });
  mockedServer.mockReturnValue(server as never);
  mockedCreate.mockReturnValue(adminProbeMock(true, 0));

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe('user_not_found');
  expect(server.__upload).not.toHaveBeenCalled();
  expect(server.__upsert).not.toHaveBeenCalled();
});

it('targetUserId superuser mais la lecture GoTrue échoue (user présent, error non-null) : 404, aucun fichier écrit', async () => {
  // Isole la jambe `authTargetErr` du `if (authTargetErr || !authTarget?.user)` : `user` est
  // présent ici, donc seul le test de `error` peut faire tomber cette requête en 404. Si cette
  // moitié de la garde disparaissait silencieusement, ce test (et lui seul) rougirait.
  const server = serverMock({
    getUserById: jest.fn().mockResolvedValue({ data: { user: { id: TARGET } }, error: { message: 'boom' } }),
  });
  mockedServer.mockReturnValue(server as never);
  mockedCreate.mockReturnValue(adminProbeMock(true, 0));

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(404);
  expect((await res.json()).error).toBe('user_not_found');
  expect(server.__upload).not.toHaveBeenCalled();
  expect(server.__upsert).not.toHaveBeenCalled();
});

it('targetUserId égal à son propre id en MAJUSCULES (non-admin) : reste le bras "soi-même", chemin dérivé du JWT (callerId canonique), persistance en tant qu’appelant', async () => {
  // Constat de revue : `userId` ne doit JAMAIS être alimenté par la chaîne cliente `target` sur
  // le bras "soi-même" — seulement par `callerId` (JWT). Avant le correctif (`let userId =
  // target`), ce test rougit : le chemin storage et l'update `.eq()` portent la casse envoyée
  // par le client au lieu de l'id canonique du JWT.
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  const asCallerEq = jest.fn().mockResolvedValue({ error: null });
  const asCallerUpdate = jest.fn().mockReturnValue({ eq: asCallerEq });
  mockedCreate.mockReturnValue({ from: () => ({ update: asCallerUpdate }) } as never);

  const res = await POST(req({ targetUserId: CALLER.toUpperCase() }));
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.url).toContain(`${CALLER}/avatar.jpg`);
  expect(body.url).not.toContain(CALLER.toUpperCase());
  // Chemin storage dérivé du JWT, jamais de la chaîne cliente en majuscules.
  expect(server.__upload).toHaveBeenCalledWith(`${CALLER}/avatar.jpg`, expect.anything(), expect.anything());
  // Persistance EN TANT QU'APPELANT (policy self-update), pas le client service-role.
  expect(asCallerUpdate).toHaveBeenCalled();
  expect(asCallerEq).toHaveBeenCalledWith('id', CALLER);
  expect(server.__update).not.toHaveBeenCalled();
  expect(server.__upsert).not.toHaveBeenCalled();
});
