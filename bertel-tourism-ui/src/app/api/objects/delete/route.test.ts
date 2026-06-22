/** @jest-environment node */
import { POST } from './route';

// §108 — auth + RPC run on the anon "caller" client (createClient); the service-role client is
// used ONLY for the best-effort Storage sweep. Deletion is therefore gated on the superuser RPC,
// NOT on the presence of SUPABASE_SERVICE_ROLE_KEY.
const removeMock = jest.fn().mockResolvedValue({ error: null });
const getUserMock = jest.fn();
const rpcMock = jest.fn();
const getServerSupabaseClientMock = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getServerSupabaseClient: () => getServerSupabaseClientMock(),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    auth: { getUser: getUserMock },
    schema: () => ({ rpc: rpcMock }),
  }),
}));

function req(body: unknown, auth = 'Bearer jwt-123'): any {
  return { headers: { get: (k: string) => (k === 'authorization' ? auth : null) }, json: async () => body };
}

const serviceClient = { storage: { from: () => ({ remove: removeMock }) } };

describe('POST /api/objects/delete', () => {
  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://supabase.test';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  });
  beforeEach(() => {
    jest.clearAllMocks();
    getServerSupabaseClientMock.mockReturnValue(serviceClient); // service key present by default
    getUserMock.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
  });

  it('401 when no bearer token', async () => {
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }, ''));
    expect(res.status).toBe(401);
  });

  it('401 when the JWT is invalid (getUser returns no user)', async () => {
    getUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'bad jwt' } });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(401);
  });

  it('400 when objectId is missing', async () => {
    const res = await POST(req({ confirmName: 'X' }));
    expect(res.status).toBe(400);
  });

  it('deletes via the caller RPC then sweeps both buckets when the service key is present', async () => {
    rpcMock.mockResolvedValue({
      data: {
        object_id: 'HOTRUN0000000001', object_name: 'Hôtel X', deleted: true,
        media_to_delete: ['https://x/storage/v1/object/public/media/HOTRUN0000000001/a.jpg'],
        documents_to_delete: ['https://x/storage/v1/object/public/documents/HOTRUN0000000001/d.pdf'],
      },
      error: null,
    });
    const res = await POST(req({ objectId: 'HOTRUN0000000001', confirmName: 'Hôtel X' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.storageSkipped).toBe(false);
    expect(json.mediaDeleted).toEqual(['HOTRUN0000000001/a.jpg']);
    expect(json.documentsDeleted).toEqual(['HOTRUN0000000001/d.pdf']);
    expect(removeMock).toHaveBeenCalledTimes(2); // media bucket + documents bucket
  });

  it('still deletes the object but skips the sweep when the service key is missing (auth ≠ service key)', async () => {
    getServerSupabaseClientMock.mockReturnValue(null); // SUPABASE_SERVICE_ROLE_KEY unset
    rpcMock.mockResolvedValue({
      data: {
        object_id: 'o1', deleted: true,
        media_to_delete: ['https://x/storage/v1/object/public/media/o1/a.jpg'],
        documents_to_delete: [],
      },
      error: null,
    });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.storageSkipped).toBe(true);
    expect(removeMock).not.toHaveBeenCalled(); // no service client → no file deletion attempted
  });

  it('maps the superuser gate to 403', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'FORBIDDEN: suppression définitive réservée aux administrateurs plateforme' } });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(403);
  });

  it('maps MUST_ARCHIVE_FIRST to 400', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'MUST_ARCHIVE_FIRST: archivez la fiche...' } });
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }));
    expect(res.status).toBe(400);
  });
});
