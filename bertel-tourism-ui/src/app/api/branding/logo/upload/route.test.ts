/** @jest-environment node */
// Route logo branding — MÊME modèle que /api/avatar/upload : autorise AS THE CALLER
// (api.is_platform_admin, la garde d'upsert_app_branding), strippe l'EXIF via process-image
// (outputFormat 'preserve'), écrit en service-role. Le gate EST la frontière (le storage
// write bypass RLS). La route renvoie l'URL/chemin, elle N'ÉCRIT PAS la ligne branding.
import { POST } from './route';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('../../../media/upload/process-image', () => ({
  processImage: jest.fn(async () => ({ buffer: Buffer.from([9, 9, 9]), width: 512, height: 256, mimeType: 'image/png' })),
  MediaProcessingError: class extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  },
}));

import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';
import { processImage } from '../../../media/upload/process-image';

const mockedServer = jest.mocked(getServerSupabaseClient);
const mockedCreate = jest.mocked(createClient);
const mockedProcess = jest.mocked(processImage);

function makeForm(): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }));
  return form;
}

function makeOrgForm(orgId: string): FormData {
  const form = new FormData();
  form.append('file', new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' }));
  form.append('orgObjectId', orgId);
  return form;
}

function req(headers: Record<string, string>, form: FormData): never {
  return { headers: new Headers(headers), formData: async () => form } as never;
}

const uploadSpy = jest.fn().mockResolvedValue({ error: null });

/** Server client : getUser OK + storage upload OK + getPublicUrl. */
function serverOk() {
  return {
    auth: { getUser: jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) },
    storage: {
      from: jest.fn(() => ({
        upload: uploadSpy,
        getPublicUrl: jest.fn((p: string) => ({ data: { publicUrl: `https://cdn/branding-assets/${p}` } })),
      })),
    },
  } as never;
}

describe('POST /api/branding/logo/upload — admin gate as-the-caller + pipeline', () => {
  beforeEach(() => {
    mockedServer.mockReset();
    mockedCreate.mockReset();
    mockedProcess.mockClear();
    uploadSpy.mockClear();
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
  });

  it('500 quand la service-role key est absente', async () => {
    mockedServer.mockReturnValue(null as never);
    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe('server_misconfigured');
  });

  it('401 sans bearer', async () => {
    mockedServer.mockReturnValue(serverOk());
    const res = await POST(req({}, makeForm()));
    expect(res.status).toBe(401);
  });

  it('403 quand le caller n est pas platform admin (storage-spam hole fermé)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('is_platform_admin');
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('403 (fail-closed) quand la sonde admin erre', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { message: 'boom' } });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(403);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('415 sur un MIME non autorisé (gate process-image)', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);
    const { MediaProcessingError } = jest.requireMock('../../../media/upload/process-image');
    mockedProcess.mockRejectedValueOnce(new MediaProcessingError('mime', 'Unsupported MIME type'));

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(415);
  });

  it('201 + { logoStoragePath, logoPublicUrl, logoMimeType } quand admin : preserve, extension = format réel', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeForm()));
    expect(res.status).toBe(201);
    const payload = await res.json();
    expect(mockedProcess).toHaveBeenCalledTimes(1);
    // processImage est appelé avec outputFormat 'preserve' (transparence conservée).
    expect(mockedProcess).toHaveBeenCalledWith(expect.objectContaining({ outputFormat: 'preserve' }));
    // Le chemin dérive l'extension du format RÉELLEMENT encodé (png), pas du nom appelant.
    expect(payload.logoStoragePath).toMatch(/^global\/.*\.png$/);
    expect(payload.logoMimeType).toBe('image/png');
    expect(payload.logoPublicUrl).toBe(`https://cdn/branding-assets/${payload.logoStoragePath}`);
  });

  it('per-org : 201 + chemin org/{id}/… quand user_can_manage_org_branding = true', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: true, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeOrgForm('ORGRUN123')));
    expect(res.status).toBe(201);
    expect(rpc).toHaveBeenCalledWith('user_can_manage_org_branding', { p_org_object_id: 'ORGRUN123' });
    const payload = await res.json();
    expect(payload.logoStoragePath).toMatch(/^org\/ORGRUN123\/.*\.png$/);
  });

  it('per-org : 403 + pas d upload quand user_can_manage_org_branding = false', async () => {
    mockedServer.mockReturnValue(serverOk());
    const rpc = jest.fn().mockResolvedValue({ data: false, error: null });
    mockedCreate.mockReturnValue({ schema: () => ({ rpc }) } as never);

    const res = await POST(req({ authorization: 'Bearer t' }, makeOrgForm('ORGRUN123')));
    expect(res.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('user_can_manage_org_branding', { p_org_object_id: 'ORGRUN123' });
    expect(uploadSpy).not.toHaveBeenCalled();
  });
});
