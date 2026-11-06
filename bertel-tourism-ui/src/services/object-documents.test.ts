import { getActiveObjectDocuments, getObjectDocumentUrl } from './object-documents';
import { getApiClient, getSupabaseClient } from '../lib/supabase';
import { useSessionStore } from '../store/session-store';

jest.mock('../lib/supabase', () => ({ getApiClient: jest.fn(), getSupabaseClient: jest.fn() }));
const documentId = '00000000-0000-4000-a000-000000000701';
const legacy = 'https://storage.example.invalid/storage/v1/object/public/old_legal_media/synthetic.pdf';
const fetchMock = jest.fn();
const originalFetch = global.fetch;

beforeEach(() => {
  jest.clearAllMocks();
  global.fetch = fetchMock;
  useSessionStore.setState({ demoMode: false });
  jest.mocked(getSupabaseClient).mockReturnValue({ auth: { getSession: jest.fn(async () => ({ data: { session: { access_token: 'synthetic-token' } } })) } } as never);
});
afterAll(() => { global.fetch = originalFetch; });

it('accepts private envelopes without permanent URLs, and removes legacy public URLs from the client model', async () => {
  const rpc = jest.fn(async () => ({ data: { authorized: true, documents: [
    { document_id: documentId, title: 'Synthetic private', requires_signing: true },
    { document_id: 'legacy', title: 'Synthetic legacy', url: legacy },
    { document_id: 'public', title: 'Synthetic public', url: 'https://example.invalid/public.pdf' },
  ] }, error: null }));
  jest.mocked(getApiClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const result = await getActiveObjectDocuments('object-a');
  expect(result.documents).toHaveLength(3);
  expect(result.documents[0]).toMatchObject({ id: documentId, url: '', requiresSigning: true });
  expect(result.documents[1]).toMatchObject({ id: 'legacy', url: '', requiresSigning: true });
  expect(result.documents[2]).toMatchObject({ id: 'public', url: 'https://example.invalid/public.pdf', requiresSigning: false });
});

it('requests a new URL for the exact pair on each opening, using the current bearer and no cache', async () => {
  fetchMock.mockImplementation(async () => ({ ok: true, json: async () => ({ url: 'https://storage.example.invalid/signed?token=synthetic' }) }));
  await getObjectDocumentUrl('object-a', documentId);
  await getObjectDocumentUrl('object-a', documentId);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith('/api/object-document/url', expect.objectContaining({
    method: 'POST', cache: 'no-store', headers: { Authorization: 'Bearer synthetic-token', 'Content-Type': 'application/json' },
    body: JSON.stringify({ objectId: 'object-a', documentId }),
  }));
});

it('does not send an opening request after its caller aborts', async () => {
  const controller = new AbortController(); controller.abort();
  await expect(getObjectDocumentUrl('object-a', documentId, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
  expect(fetchMock).not.toHaveBeenCalled();
});

it('sends the existing legal reader context explicitly without changing the object/document pair', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'https://storage.example.invalid/signed?token=synthetic' }) });
  await getObjectDocumentUrl('object-a', documentId, undefined, 'legal');
  expect(fetchMock).toHaveBeenCalledWith('/api/object-document/url', expect.objectContaining({
    body: JSON.stringify({ objectId: 'object-a', documentId, accessContext: 'legal' }),
  }));
});

it('does not send an opening request without an authenticated token', async () => {
  jest.mocked(getSupabaseClient).mockReturnValue({ auth: { getSession: jest.fn(async () => ({ data: { session: null } })) } } as never);
  await expect(getObjectDocumentUrl('object-a', documentId)).rejects.toThrow('session');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('refuses an executable URL even if a malformed backend response returns200', async () => {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ url: 'javascript:alert(1)' }) });
  await expect(getObjectDocumentUrl('object-a', documentId)).rejects.toThrow('indisponible');
});
