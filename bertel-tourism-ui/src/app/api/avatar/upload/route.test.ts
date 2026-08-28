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

function serverMock(opts: { memberships?: Array<{ user_id: string; org_object_id: string }>; update?: jest.Mock }) {
  const memberships = opts.memberships ?? [
    { user_id: CALLER, org_object_id: 'ORG1' },
    { user_id: TARGET, org_object_id: 'ORG1' },
  ];
  const update = opts.update ?? jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
  return {
    __update: update,
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: CALLER } }, error: null }) },
    from: jest.fn((table: string) =>
      table === 'user_org_membership'
        ? { select: () => ({ in: () => ({ eq: async () => ({ data: memberships, error: null }) }) }) }
        : { update },
    ),
    storage: {
      from: () => ({
        upload: jest.fn().mockResolvedValue({ error: null }),
        getPublicUrl: (p: string) => ({ data: { publicUrl: `https://cdn/${p}` } }),
      }),
    },
  };
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
});

it('targetUserId d’un membre de la même ORG : chemin de la CIBLE, persisté en service-role', async () => {
  const server = serverMock({});
  mockedServer.mockReturnValue(server as never);
  // 1er createClient = sonde d'autorisation (superuser true) ; on rend le même objet aux deux.
  mockedCreate.mockReturnValue({
    schema: () => ({ rpc: jest.fn().mockResolvedValue({ data: true, error: null }) }),
    from: () => ({ update: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) }) }),
  } as never);

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(201);
  expect((await res.json()).url).toContain(`${TARGET}/avatar.jpg`);
  expect(server.__update).toHaveBeenCalledWith({ avatar_url: expect.stringContaining(`${TARGET}/avatar.jpg`) });
});

it('targetUserId hors périmètre : 403, aucun fichier écrit', async () => {
  const server = serverMock({
    memberships: [{ user_id: CALLER, org_object_id: 'ORG1' }, { user_id: TARGET, org_object_id: 'ORG2' }],
  });
  mockedServer.mockReturnValue(server as never);
  const rpc = jest.fn()
    .mockResolvedValueOnce({ data: false, error: null })
    .mockResolvedValueOnce({ data: 30, error: null });
  mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

  const res = await POST(req({ targetUserId: TARGET }));
  expect(res.status).toBe(403);
  expect((await res.json()).error).toBe('out_of_scope');
});
