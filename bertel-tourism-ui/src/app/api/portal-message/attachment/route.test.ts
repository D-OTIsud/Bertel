/** @jest-environment node */
import { PUT } from './route';
import { authenticated, callerClient } from '../../_document-auth';

jest.mock('../../_document-auth', () => ({
  authenticated: jest.fn(), callerClient: jest.fn(), PRIVATE_BUCKET: 'actor-documents',
  UUID_SHAPE: /^[0-9a-f-]{36}$/i,
}));
jest.mock('@/lib/request-body.server', () => ({
  ...jest.requireActual('@/lib/request-body.server'), readBoundedJson: jest.fn(req => req.json()),
}));
const rpc = jest.fn(), sign = jest.fn();
const DOC = '00000000-0000-4000-a000-000000008204';
const req = (body: unknown): never => ({ json: async () => body } as never);
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(authenticated).mockResolvedValue({ ok: true, jwt: 'caller-jwt', server: {
    storage: { from: () => ({ createSignedUrl: sign }) },
  } } as never);
  jest.mocked(callerClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  rpc.mockResolvedValue({ data: { bucket: 'actor-documents', path: 'portal-messages/registered/doc.pdf' }, error: null });
  sign.mockResolvedValue({ data: { signedUrl: 'https://private.test/signed' }, error: null });
});

test('consultation refusée sans authentification : aucun accès au document', async () => {
  jest.mocked(authenticated).mockResolvedValue({ ok: false, response: new Response(null, { status: 401 }) } as never);
  expect((await PUT(req({ documentId: DOC }))).status).toBe(401);
  expect(rpc).not.toHaveBeenCalled(); expect(sign).not.toHaveBeenCalled();
});

test.each([
  { data: null, error: { code: '42501' } },
  { data: { bucket: 'media', path: 'portal-messages/forged.jpg' }, error: null },
  { data: { bucket: 'actor-documents', path: 'portal-photos/unrelated.jpg' }, error: null },
])('l’identité et le chemin sont revérifiés côté serveur avant signature', async result => {
  rpc.mockResolvedValue(result);
  expect((await PUT(req({ documentId: DOC }))).status).toBe(403);
  expect(sign).not.toHaveBeenCalled();
});

test('le lecteur CRM ne signe que le document autorisé pour120s sanscache', async () => {
  const response = await PUT(req({ documentId: DOC }));
  expect(response.status).toBe(200);
  expect(callerClient).toHaveBeenCalledWith('caller-jwt');
  expect(rpc).toHaveBeenCalledWith('portal_message_document', { p_document_id: DOC });
  expect(sign).toHaveBeenCalledWith('portal-messages/registered/doc.pdf', 120, { download: true });
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(await response.json()).toEqual({ url: 'https://private.test/signed' });
});

test('une erreur de signature conserve l’échec et ne révèle aucun chemin', async () => {
  sign.mockResolvedValue({ data: null, error: { message: 'private storage path' } });
  const response = await PUT(req({ documentId: DOC }));
  expect(response.status).toBe(500); expect(await response.json()).toEqual({ error: 'unavailable' });
});
