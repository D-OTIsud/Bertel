/** @jest-environment node */
import { POST } from './route';

// Mock the server supabase client + supabase-js createClient used inside the route.
const removeMock = jest.fn().mockResolvedValue({ error: null });
const getUserMock = jest.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
const rpcMock = jest.fn();

jest.mock('@/lib/supabase-server', () => ({
  getServerSupabaseClient: () => ({
    auth: { getUser: getUserMock },
    storage: { from: () => ({ remove: removeMock }) },
  }),
}));
jest.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ schema: () => ({ rpc: rpcMock }) }),
}));

function req(body: unknown, auth = 'Bearer jwt-123'): any {
  return { headers: { get: (k: string) => (k === 'authorization' ? auth : null) }, json: async () => body };
}

describe('POST /api/objects/delete', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  it('401 when no bearer token', async () => {
    const res = await POST(req({ objectId: 'o1', confirmName: 'X' }, ''));
    expect(res.status).toBe(401);
  });

  it('400 when objectId is missing', async () => {
    const res = await POST(req({ confirmName: 'X' }));
    expect(res.status).toBe(400);
  });

  it('deletes then sweeps both buckets, returns the report', async () => {
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
    expect(json.mediaDeleted).toEqual(['HOTRUN0000000001/a.jpg']);
    expect(json.documentsDeleted).toEqual(['HOTRUN0000000001/d.pdf']);
    expect(removeMock).toHaveBeenCalledTimes(2); // media bucket + documents bucket
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
