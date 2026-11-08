/** @jest-environment node */
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../media/upload/process-image', () => ({
  processImage: jest.fn().mockResolvedValue({ buffer: Buffer.from('img'), mimeType: 'image/jpeg' }),
  MAX_INPUT_BYTES: 20 * 1024 * 1024,
  MediaProcessingError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));
// Auth/permission-focused tests below stub `formData` directly on fake `req` objects.
jest.mock('@/lib/request-body.server', () => {
  const actual = jest.requireActual('@/lib/request-body.server');
  return {
    ...actual,
    readBoundedFormData: jest.fn((req: { formData: () => Promise<FormData> }) => req.formData()),
  };
});
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { MediaProcessingError, processImage } from '../../media/upload/process-image';

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
const generationPath = (owner: string) => new RegExp(`^${owner}/avatar-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.jpg$`);

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

function avatarReceipt(params: Record<string, unknown>, state = 'engaged') {
  return { uploadId: params.p_upload_id, userId: params.p_user_id, path: params.p_storage_path,
    sha256: params.p_sha256, sizeBytes: params.p_size_bytes, state };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function serverMock(opts: {
  memberships?: Array<{ user_id: string; org_object_id: string }>;
  update?: jest.Mock;
  getUserById?: jest.Mock;
  avatarRpc?: jest.Mock;
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
  // Bucket en mémoire : l'absence d'écrasement et de suppression s'observe sur l'état final.
  const objects = new Map<string, unknown>();
  const upload = jest.fn(async (path: string, body: unknown, options: { upsert?: boolean }) => {
    if (objects.has(path) && !options.upsert) return { error: { message: 'The resource already exists' } };
    objects.set(path, body);
    return { error: null };
  });
  const remove = jest.fn(async (paths: string[]) => {
    paths.forEach((path) => objects.delete(path));
    return { error: null };
  });
  const getUserById =
    opts.getUserById ?? jest.fn().mockResolvedValue({ data: { user: { id: TARGET_CANONICAL } }, error: null });
  const avatarRpc = opts.avatarRpc ?? jest.fn(async (name: string, params: Record<string, unknown>) => ({
    data: avatarReceipt(params, name === 'begin_avatar_upload' ? 'engaged' : 'finished'), error: null,
  }));
  return {
    __update: update,
    __upsert: upsert,
    __upload: upload,
    __remove: remove,
    __objects: objects,
    __avatarRpc: avatarRpc,
    schema: () => ({ rpc: avatarRpc }),
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
        remove,
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
  expect((await res.json()).url).toContain(`${CALLER}/avatar-`);
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
    expect((await res.json()).url).toContain(`${CALLER}/avatar-`);
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
  expect((await res.json()).url).toContain(`${TARGET_CANONICAL}/avatar-`);
  expect(server.__upsert).toHaveBeenCalledWith(
    { id: TARGET_CANONICAL, avatar_url: expect.stringContaining(`${TARGET_CANONICAL}/avatar-`) },
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
  expect((await res.json()).url).toContain(`${TARGET_CANONICAL}/avatar-`);
  expect(server.__upsert).toHaveBeenCalledWith(
    { id: TARGET_CANONICAL, avatar_url: expect.stringContaining(`${TARGET_CANONICAL}/avatar-`) },
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
  expect(body.url).toContain(`${CALLER}/avatar-`);
  expect(body.url).not.toContain(CALLER.toUpperCase());
  // Chemin storage dérivé du JWT, jamais de la chaîne cliente en majuscules.
  expect(server.__upload).toHaveBeenCalledWith(expect.stringMatching(generationPath(CALLER)), expect.anything(), expect.anything());
  // Persistance EN TANT QU'APPELANT (policy self-update), pas le client service-role.
  expect(asCallerUpdate).toHaveBeenCalled();
  expect(asCallerEq).toHaveBeenCalledWith('id', CALLER);
  expect(server.__update).not.toHaveBeenCalled();
  expect(server.__upsert).not.toHaveBeenCalled();
});

it.each([
  ['processing', 'process_failed', 500],
  ['storage', 'upload_failed', 502],
  ['profile', 'profile_update_failed', 500],
] as const)('correlates the %s failure without returning its internal message', async (kind, code, status) => {
  const cause = 'synthetic internal detail AVATAR_SENTINEL';
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  const asCallerEq = jest.fn().mockResolvedValue({ error: { message: cause } });
  const asCallerUpdate = jest.fn().mockReturnValue({ eq: asCallerEq });
  mockedCreate.mockReturnValue({ from: () => ({ update: asCallerUpdate }) } as never);
  if (kind === 'processing') jest.mocked(processImage).mockRejectedValueOnce(new Error(cause));
  if (kind === 'storage') server.__upload.mockResolvedValueOnce({ error: { message: cause } });

  const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  try {
    const res = await POST(req());
    expect(res.status).toBe(status);
    expect(server.__upload).toHaveBeenCalledTimes(kind === 'processing' ? 0 : 1);
    expect(asCallerEq).toHaveBeenCalledTimes(kind === 'profile' ? 1 : 0);
    expect(await res.json()).toEqual({ error: code });
    const requestId = res.headers.get('x-request-id');
    expect(requestId).toMatch(/^[a-f0-9-]{36}$/);
    expect(warn.mock.calls).toEqual([['[route-error]', { route: 'avatar/upload.POST', code, requestId }]]);
  } finally {
    warn.mockRestore();
  }
});

describe('generations: distinct keys, never overwritten or compensated', () => {
  function callerUpdating(eq: jest.Mock) {
    mockedCreate.mockReturnValue({ from: () => ({ update: () => ({ eq }) }) } as never);
  }

  it.each([
    ['outstanding erasure', () => jest.fn().mockResolvedValue({ data: false, error: null })],
    ['missing capability', () => jest.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } })],
    ['error alongside true', () => jest.fn().mockResolvedValue({ data: true, error: { code: 'XX000' } })],
    ['malformed response', () => jest.fn().mockResolvedValue({ data: 'true', error: null })],
    ['transport rejection', () => jest.fn().mockRejectedValue(new Error('synthetic transport failure'))],
  ])('%s prevents every Storage/profile effect', async (_name, makeCheck) => {
    const server = serverMock({ avatarRpc: makeCheck() });
    mockedServer.mockReturnValue(server as never);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await POST(req());
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: 'upload_failed' });
    } finally {
      warn.mockRestore();
    }
    expect(server.__avatarRpc).toHaveBeenCalledWith('begin_avatar_upload', expect.objectContaining({ p_user_id: CALLER }));
    expect(server.__upload).not.toHaveBeenCalled();
    expect(server.__update).not.toHaveBeenCalled();
    expect(server.__upsert).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('checks the canonical Auth target after admin scope validation', async () => {
    const server = serverMock({});
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(adminProbeMock(true, 0));
    expect((await POST(req({ targetUserId: TARGET }))).status).toBe(201);
    expect(server.__avatarRpc).toHaveBeenCalledWith('begin_avatar_upload', expect.objectContaining({ p_user_id: TARGET_CANONICAL }));
  });

  it('does not touch Storage while the durable begin ACK is still pending', async () => {
    const entered = deferred<undefined>();
    const ack = deferred<unknown>();
    let params!: Record<string, unknown>;
    const server = serverMock({ avatarRpc: jest.fn((name: string, input: Record<string, unknown>) => {
      if (name === 'begin_avatar_upload') { params = input; entered.resolve(undefined); return ack.promise; }
      return Promise.resolve({ data: avatarReceipt(input, 'finished'), error: null });
    }) });
    mockedServer.mockReturnValue(server as never);
    callerUpdating(jest.fn().mockResolvedValue({ error: null }));
    const request = POST(req());
    await entered.promise;
    expect(server.__upload).not.toHaveBeenCalled();
    ack.resolve({ data: avatarReceipt(params), error: null });
    expect((await request).status).toBe(201);
  });

  it.each(['uploadId', 'userId', 'path', 'sha256', 'sizeBytes', 'state'])(
    'refuses a begin ACK with a different %s before any effect', async (field) => {
      const server = serverMock({ avatarRpc: jest.fn(async (_name: string, params: Record<string, unknown>) => ({
        data: { ...avatarReceipt(params), [field]: 'different' }, error: null,
      })) });
      mockedServer.mockReturnValue(server as never);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try { expect((await POST(req())).status).toBe(503); } finally { warn.mockRestore(); }
      expect(server.__upload).not.toHaveBeenCalled();
      expect(mockedCreate).not.toHaveBeenCalled();
      expect(server.__avatarRpc).toHaveBeenCalledTimes(1);
    },
  );

  it('keeps the intent engaged until both Storage and profile ACKs have resolved', async () => {
    const uploadEntered = deferred<undefined>();
    const uploadAck = deferred<{ error: null }>();
    const profileEntered = deferred<undefined>();
    const profileAck = deferred<{ error: null }>();
    const server = serverMock({});
    server.__upload.mockImplementationOnce((path, body) => {
      server.__objects.set(path, body); // bytes may already have been accepted before ACK
      uploadEntered.resolve(undefined); return uploadAck.promise;
    });
    mockedServer.mockReturnValue(server as never);
    callerUpdating(jest.fn(() => { profileEntered.resolve(undefined); return profileAck.promise; }));
    const request = POST(req());
    await uploadEntered.promise;
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload']);
    uploadAck.resolve({ error: null });
    await profileEntered.promise;
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload']);
    profileAck.resolve({ error: null });
    expect((await request).status).toBe(201);
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload', 'complete_avatar_upload']);
    expect(server.__avatarRpc.mock.calls[1][1]).toEqual(server.__avatarRpc.mock.calls[0][1]);
  });

  it('orders begin, Storage, profile then the final receipt, without a later write', async () => {
    const events: string[] = [];
    const server = serverMock({ avatarRpc: jest.fn(async (name: string, params: Record<string, unknown>) => {
      events.push(name); return { data: avatarReceipt(params, name === 'begin_avatar_upload' ? 'engaged' : 'finished'), error: null };
    }) });
    server.__upload.mockImplementationOnce(async () => { events.push('storage'); return { error: null }; });
    mockedServer.mockReturnValue(server as never);
    callerUpdating(jest.fn(async () => { events.push('profile'); return { error: null }; }));
    expect((await POST(req())).status).toBe(201);
    expect(events).toEqual(['begin_avatar_upload', 'storage', 'profile', 'complete_avatar_upload']);
    expect(server.__remove).not.toHaveBeenCalled();
  });

  it.each(['returned error', 'transport rejection'])(
    'Storage %s never completes or removes an uncertain intent', async (kind) => {
      const server = serverMock({});
      if (kind === 'returned error') server.__upload.mockResolvedValueOnce({ error: { message: 'synthetic failure' } });
      else server.__upload.mockRejectedValueOnce(new Error('synthetic transport failure'));
      mockedServer.mockReturnValue(server as never);
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
      try { expect((await POST(req())).status).toBe(502); } finally { warn.mockRestore(); }
      expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload']);
      expect(server.__remove).not.toHaveBeenCalled();
      expect(mockedCreate).not.toHaveBeenCalled();
    },
  );

  it('a lost completion ACK never retries Storage, profile or receipt', async () => {
    const server = serverMock({ avatarRpc: jest.fn(async (name: string, params: Record<string, unknown>) => {
      if (name === 'complete_avatar_upload') throw new Error('synthetic lost ACK');
      return { data: avatarReceipt(params), error: null };
    }) });
    mockedServer.mockReturnValue(server as never);
    const eq = jest.fn().mockResolvedValue({ error: null });
    callerUpdating(eq);
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try { expect((await POST(req())).status).toBe(500); } finally { warn.mockRestore(); }
    expect(server.__upload).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledTimes(1);
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload', 'complete_avatar_upload']);
    expect(server.__remove).not.toHaveBeenCalled();
  });

  it('two uploads create two distinct owner-prefixed keys with upsert:false and keep both files', async () => {
    const server = serverMock({});
    mockedServer.mockReturnValue(server as never);
    callerUpdating(jest.fn().mockResolvedValue({ error: null }));

    const first = await (await POST(req())).json();
    const second = await (await POST(req())).json();

    const paths = server.__upload.mock.calls.map(([path]) => path);
    expect(paths[0]).toMatch(generationPath(CALLER));
    expect(paths[1]).toMatch(generationPath(CALLER));
    expect(paths[0]).not.toBe(paths[1]);
    for (const [, , options] of server.__upload.mock.calls) expect(options.upsert).toBe(false);
    expect(first.url).toContain(paths[0]);
    expect(second.url).toContain(paths[1]);
    expect([...server.__objects.keys()].sort()).toEqual([...paths].sort());
    expect(server.__remove).not.toHaveBeenCalled();
  });

  it('a legacy object stays readable: a new upload neither rewrites nor removes it', async () => {
    const server = serverMock({});
    const legacyBytes = Buffer.from('legacy');
    server.__objects.set(`${CALLER}/avatar.jpg`, legacyBytes);
    mockedServer.mockReturnValue(server as never);
    callerUpdating(jest.fn().mockResolvedValue({ error: null }));

    const res = await POST(req());

    expect(res.status).toBe(201);
    expect(server.__objects.get(`${CALLER}/avatar.jpg`)).toBe(legacyBytes);
    expect(server.__objects.size).toBe(2);
  });

  it.each([
    ['transport rejection after a possible COMMIT', () => jest.fn().mockRejectedValue(new Error('socket hang up'))],
    ['returned error after a possible COMMIT', () => jest.fn().mockResolvedValue({ error: { message: 'fetch failed' } })],
  ])('self update, %s: 500 without removing the uploaded file', async (_name, makeEq) => {
    const server = serverMock({});
    mockedServer.mockReturnValue(server as never);
    callerUpdating(makeEq());
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await POST(req());
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'profile_update_failed' });
    } finally {
      warn.mockRestore();
    }
    const [uploadedPath] = server.__upload.mock.calls[0];
    expect(server.__objects.has(uploadedPath)).toBe(true);
    expect(server.__remove).not.toHaveBeenCalled();
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload']);
  });

  it('admin upsert transport rejection: 500 without removing the uploaded file', async () => {
    const server = serverMock({});
    server.__upsert.mockRejectedValueOnce(new Error('socket hang up'));
    mockedServer.mockReturnValue(server as never);
    mockedCreate.mockReturnValue(adminProbeMock(true, 0));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await POST(req({ targetUserId: TARGET }));
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual({ error: 'profile_update_failed' });
    } finally {
      warn.mockRestore();
    }
    const [uploadedPath] = server.__upload.mock.calls[0];
    expect(uploadedPath).toMatch(generationPath(TARGET_CANONICAL));
    expect(server.__objects.has(uploadedPath)).toBe(true);
    expect(server.__remove).not.toHaveBeenCalled();
    expect(server.__avatarRpc.mock.calls.map(([name]) => name)).toEqual(['begin_avatar_upload']);
  });
});

it('keeps the public decode message on a rejected image', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  jest.mocked(processImage).mockRejectedValueOnce(new MediaProcessingError('decode', 'Image illisible.'));
  const res = await POST(req());
  expect(res.status).toBe(400);
  expect(await res.json()).toEqual({ error: 'decode', detail: 'Image illisible.' });
  expect(res.headers.has('x-request-id')).toBe(false);
  expect(server.__upload).not.toHaveBeenCalled();
});
