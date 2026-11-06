/** @jest-environment node */
import { NextRequest } from 'next/server';
import { POST } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));

const OBJECT = 'HOTRUN0000000001';
const DOCUMENT = '00000000-0000-4000-a000-000000000701';
const PATH = `objects/${OBJECT}/${DOCUMENT}.pdf`;
const SIGNED = `https://storage.example.invalid/storage/v1/object/sign/legal-documents/${PATH}?token=synthetic`;

function request(body: unknown = { objectId: OBJECT, documentId: DOCUMENT }, bearer = 'synthetic-jwt') {
  return new NextRequest('https://app.example.invalid/api/object-document/url', {
    method: 'POST', headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function harness(payload: unknown = { authorized: true, file: { bucket: 'legal-documents', path: PATH } }) {
  const rpc = jest.fn().mockResolvedValue({ data: payload, error: null });
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const createSignedUrls = jest.fn().mockResolvedValue({ data: [{ path: PATH, signedUrl: SIGNED, error: null }], error: null });
  const storageFrom = jest.fn(() => ({ createSignedUrls }));
  const from = jest.fn();
  const getUser = jest.fn().mockResolvedValue({ data: { user: { id: 'synthetic-user' } }, error: null });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser }, storage: { from: storageFrom }, from } as never);
  return { rpc, createSignedUrls, storageFrom, getUser, from };
}

beforeEach(() => jest.clearAllMocks());

it('refuses an anonymous/invalid session before any document resolution or signing', async () => {
  const h = harness();
  expect((await POST(request(undefined, ''))).status).toBe(401);
  h.getUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'invalid_token' } });
  expect((await POST(request())).status).toBe(401);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.createSignedUrls).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
});

it.each([null, [], { objectId: OBJECT, documentId: 'bad' }, { objectId: {}, documentId: DOCUMENT }])('rejects malformed fields before the caller gate: %p', async (body) => {
  const h = harness();
  expect((await POST(request(body))).status).toBe(400);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.createSignedUrls).not.toHaveBeenCalled();
});

it('bounds the real request stream before JSON parsing', async () => {
  const h = harness();
  expect((await POST(request({ objectId: OBJECT, documentId: DOCUMENT, padding: 'x'.repeat(3000) }))).status).toBe(413);
  expect(h.rpc).not.toHaveBeenCalled();
});

it.each([{ authorized: false, file: null }, null])('refuses a wrong ORG/object verdict without calling the service signer', async (payload) => {
  const h = harness(payload);
  expect((await POST(request())).status).toBe(403);
  expect(h.createSignedUrls).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
});

it('does not sign an unrelated document ID even if the object is authorized', async () => {
  const h = harness({ authorized: true, file: null });
  expect((await POST(request())).status).toBe(404);
  expect(h.rpc).toHaveBeenCalledWith('get_object_document_file', { p_object_id: OBJECT, p_document_id: DOCUMENT });
  expect(h.createSignedUrls).not.toHaveBeenCalled();
});

it('keeps a failed authorization read closed without exposing its error detail', async () => {
  const h = harness();
  h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'synthetic private path must not escape' } });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'authorization_check_failed' });
  expect(h.createSignedUrls).not.toHaveBeenCalled();
});

it.each([
  { bucket: 'actor-documents', path: PATH }, { bucket: 'legal-documents', path: '../other.pdf' },
  { bucket: 'legal-documents', path: '/other.pdf' }, { bucket: 'legal-documents', path: '' },
])('refuses unexpected file coordinates: %p', async (file) => {
  const h = harness({ authorized: true, file });
  expect((await POST(request())).status).toBe(409);
  expect(h.createSignedUrls).not.toHaveBeenCalled();
});

it.each(['legal-documents', 'old_legal_media'])('signs a legitimate mapped file in %s for exactly60s with no response cache', async (bucket) => {
  const h = harness({ authorized: true, file: { bucket, path: PATH } });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: SIGNED.replace('/legal-documents/', `/${bucket}/`) });
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(h.storageFrom).toHaveBeenCalledWith(bucket);
  expect(h.createSignedUrls).toHaveBeenCalledWith([PATH], 60);
  expect(h.from).not.toHaveBeenCalled();
  expect(jest.mocked(createClient).mock.calls[0][2]).toMatchObject({ global: { headers: { Authorization: 'Bearer synthetic-jwt' } } });
});

it('does not return Storage error text or a location when signing fails', async () => {
  const h = harness();
  h.createSignedUrls.mockResolvedValueOnce({ data: null, error: { message: 'private object details' } });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'signed_url_failed' });
});

it('uses only the dedicated legal reader for an explicit legal context, without falling back on denial', async () => {
  const h = harness({ authorized: false, file: null });
  const response = await POST(request({ objectId: OBJECT, documentId: DOCUMENT, accessContext: 'legal' }));
  expect(response.status).toBe(403);
  expect(h.rpc).toHaveBeenCalledTimes(1);
  expect(h.rpc).toHaveBeenCalledWith('get_legal_object_document_file', { p_object_id: OBJECT, p_document_id: DOCUMENT });
  expect(h.createSignedUrls).not.toHaveBeenCalled();
});

it('refuses an unknown reader context before any database request', async () => {
  const h = harness();
  expect((await POST(request({ objectId: OBJECT, documentId: DOCUMENT, accessContext: 'classification-admin' }))).status).toBe(400);
  expect(h.rpc).not.toHaveBeenCalled();
});

it.each([[], [{ path: 'other.pdf', signedUrl: SIGNED, error: null }], [{ path: PATH, signedUrl: SIGNED, error: 'denied' }], [{ path: PATH, signedUrl: 'https://example.invalid/missing-token', error: null }]].map((data) => ({ data })))('refuses a missing or mismatched Storage receipt', async ({ data }) => {
  const h = harness();
  h.createSignedUrls.mockResolvedValueOnce({ data, error: null } as never);
  expect((await POST(request())).status).toBe(503);
});

it.each(['folder/a?query#fragment.pdf', 'folder/%2e%2e/other.pdf', 'folder/100% and résumé #1?.pdf', 'folder/name?token=inside.pdf'])('the real Storage SDK sends the exact authorized key as JSON and returns an exact encoded download target: %s', async (path) => {
  const h = harness({ authorized: true, file: { bucket: 'legal-documents', path } });
  const network: Array<{ url: URL; body: Record<string, unknown> }> = [];
  const actual = jest.requireActual('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  const real = actual.createClient('https://storage.example.invalid', 'synthetic-service-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      const outgoing = new Request(input, init);
      const body = await outgoing.json() as Record<string, unknown>;
      network.push({ url: new URL(outgoing.url), body });
      const signedURL = `/object/sign/legal-documents/${path}?token=synthetic`;
      return new Response(JSON.stringify(Array.isArray(body.paths) ? [{ path, error: null, signedURL }] : { signedURL }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    } },
  });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser: h.getUser }, storage: real.storage } as never);
  const response = await POST(request());
  expect(network).toHaveLength(1);
  expect(network[0].url.pathname).toBe('/storage/v1/object/sign/legal-documents');
  expect(network[0].url.search).toBe('');
  expect(network[0].url.hash).toBe('');
  expect(network[0].body).toEqual({ paths: [path], expiresIn: 60 });
  expect(response.status).toBe(200);
  const url = new URL((await response.json()).url);
  expect(decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/legal-documents/'.length))).toBe(path);
  expect(url.searchParams.get('token')).toBe('synthetic');
  expect(url.hash).toBe('');
});
