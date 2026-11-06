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
const SIGNED = 'https://storage.example.invalid/signed?token=synthetic';

function request(body: unknown = { objectId: OBJECT, documentId: DOCUMENT }, bearer = 'synthetic-jwt') {
  return new NextRequest('https://app.example.invalid/api/object-document/url', {
    method: 'POST', headers: { ...(bearer ? { authorization: `Bearer ${bearer}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function harness(payload: unknown = { authorized: true, file: { bucket: 'legal-documents', path: PATH } }) {
  const rpc = jest.fn().mockResolvedValue({ data: payload, error: null });
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const createSignedUrl = jest.fn().mockResolvedValue({ data: { signedUrl: SIGNED }, error: null });
  const storageFrom = jest.fn(() => ({ createSignedUrl }));
  const from = jest.fn();
  const getUser = jest.fn().mockResolvedValue({ data: { user: { id: 'synthetic-user' } }, error: null });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser }, storage: { from: storageFrom }, from } as never);
  return { rpc, createSignedUrl, storageFrom, getUser, from };
}

beforeEach(() => jest.clearAllMocks());

it('refuses an anonymous/invalid session before any document resolution or signing', async () => {
  const h = harness();
  expect((await POST(request(undefined, ''))).status).toBe(401);
  h.getUser.mockResolvedValueOnce({ data: { user: null }, error: { code: 'invalid_token' } });
  expect((await POST(request())).status).toBe(401);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.createSignedUrl).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
});

it.each([null, [], { objectId: OBJECT, documentId: 'bad' }, { objectId: {}, documentId: DOCUMENT }])('rejects malformed fields before the caller gate: %p', async (body) => {
  const h = harness();
  expect((await POST(request(body))).status).toBe(400);
  expect(h.rpc).not.toHaveBeenCalled();
  expect(h.createSignedUrl).not.toHaveBeenCalled();
});

it('bounds the real request stream before JSON parsing', async () => {
  const h = harness();
  expect((await POST(request({ objectId: OBJECT, documentId: DOCUMENT, padding: 'x'.repeat(3000) }))).status).toBe(413);
  expect(h.rpc).not.toHaveBeenCalled();
});

it.each([{ authorized: false, file: null }, null])('refuses a wrong ORG/object verdict without calling the service signer', async (payload) => {
  const h = harness(payload);
  expect((await POST(request())).status).toBe(403);
  expect(h.createSignedUrl).not.toHaveBeenCalled();
  expect(h.from).not.toHaveBeenCalled();
});

it('does not sign an unrelated document ID even if the object is authorized', async () => {
  const h = harness({ authorized: true, file: null });
  expect((await POST(request())).status).toBe(404);
  expect(h.rpc).toHaveBeenCalledWith('get_object_document_file', { p_object_id: OBJECT, p_document_id: DOCUMENT });
  expect(h.createSignedUrl).not.toHaveBeenCalled();
});

it('keeps a failed authorization read closed without exposing its error detail', async () => {
  const h = harness();
  h.rpc.mockResolvedValueOnce({ data: null, error: { message: 'synthetic private path must not escape' } });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'authorization_check_failed' });
  expect(h.createSignedUrl).not.toHaveBeenCalled();
});

it.each([
  { bucket: 'actor-documents', path: PATH }, { bucket: 'legal-documents', path: '../other.pdf' },
  { bucket: 'legal-documents', path: '/other.pdf' }, { bucket: 'legal-documents', path: '' },
])('refuses unexpected file coordinates: %p', async (file) => {
  const h = harness({ authorized: true, file });
  expect((await POST(request())).status).toBe(409);
  expect(h.createSignedUrl).not.toHaveBeenCalled();
});

it.each(['legal-documents', 'old_legal_media'])('signs a legitimate mapped file in %s for exactly60s with no response cache', async (bucket) => {
  const h = harness({ authorized: true, file: { bucket, path: PATH } });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ url: SIGNED });
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(h.storageFrom).toHaveBeenCalledWith(bucket);
  expect(h.createSignedUrl).toHaveBeenCalledWith(PATH, 60);
  expect(h.from).not.toHaveBeenCalled();
  expect(jest.mocked(createClient).mock.calls[0][2]).toMatchObject({ global: { headers: { Authorization: 'Bearer synthetic-jwt' } } });
});

it('does not return Storage error text or a location when signing fails', async () => {
  const h = harness();
  h.createSignedUrl.mockResolvedValueOnce({ data: null, error: { message: 'private object details' } });
  const response = await POST(request());
  expect(response.status).toBe(503);
  expect(await response.json()).toEqual({ error: 'signed_url_failed' });
});
