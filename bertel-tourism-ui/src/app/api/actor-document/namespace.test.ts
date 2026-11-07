/** @jest-environment node */
import { POST as open } from './url/route';
import { DELETE, PATCH } from './route';
import { getServerSupabaseClient } from '@/lib/supabase-server';
import { createClient } from '@supabase/supabase-js';

jest.mock('@/lib/supabase-server', () => ({ getServerSupabaseClient: jest.fn() }));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn() }));
jest.mock('./process-actor-document', () => ({ ACTOR_PDF_MAX_BYTES: 5242880, processActorDocumentBuffer: jest.fn() }));

const ACTOR = '11111111-2222-4333-a444-555555555555';
const DOC = '66666666-7777-4888-a999-aaaaaaaaaaaa';
const OBJECT = 'HOTRUN0000000001';
const OTHER = 'HOTRUN0000000002';
const PATH = `objects/${OBJECT}/archive expired #1?.pdf`;
const request = (documentId = DOC) => ({ headers: new Headers({ authorization: 'Bearer caller-jwt' }), json: async () => ({ actorId: ACTOR, documentId }) }) as never;
type Row = Record<string, unknown>;

function harness(options: { bucket?: string; scope?: string; status?: string; path?: string; mapping?: string | null; canonical?: boolean; legal?: boolean; pair?: boolean; documentId?: string } = {}) {
  const documentId = options.documentId ?? DOC;
  const document: Row = { storage_bucket: options.bucket ?? 'actor-documents', storage_path: options.path ?? PATH,
    access_scope: options.scope ?? 'crm_private', extra: { bertel_pj_import: { mapped_object_id: options.mapping === undefined ? OBJECT : options.mapping } } };
  const link: Row = { actor_id: ACTOR, document_id: documentId, status: options.status ?? 'active', promoted_to_object_id: OBJECT, promoted_document_id: documentId, valid_to: '2000-01-01' };
  const state = { document, link, metadataError: false, linkError: false, crm: true, canonical: options.canonical ?? false, legal: options.legal ?? false, rpcError: false, missingMappedFile: false };
  const rpc = jest.fn(async (name: string, args: Record<string, unknown>) => {
    if (name.startsWith('user_can_')) return { data: state.crm, error: null };
    if (state.rpcError) return { data: null, error: { message: 'private authority unavailable' } };
    const authorized = name === 'get_object_document_file' ? state.canonical : state.legal;
    const exact = args.p_object_id === OBJECT && args.p_document_id === documentId && !state.missingMappedFile;
    return { data: { authorized, file: authorized && exact ? { bucket: document.storage_bucket, path: document.storage_path } : null }, error: null };
  });
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const signedUrl = () => `https://storage.example.invalid/storage/v1/object/sign/${document.storage_bucket}/${document.storage_path}?token=synthetic`;
  const createSignedUrl = jest.fn(async () => ({ data: { signedUrl: signedUrl() }, error: null }));
  const createSignedUrls = jest.fn(async () => ({ data: [{ path: document.storage_path, signedUrl: signedUrl(), error: null }], error: null }));
  const remove = jest.fn(async () => ({ error: null }));
  const deleteEq = jest.fn(async () => ({ error: null }));
  const reads: Array<{ table: string; filters: Array<[string, unknown]> }> = [];
  const from = jest.fn((table: string) => ({
    select: () => {
      const filters: Array<[string, unknown]> = [];
      const builder = { eq: (key: string, value: unknown) => { filters.push([key, value]); return builder; }, maybeSingle: async () => {
        reads.push({ table, filters });
        if (table === 'actor_document') return { data: options.pair === false || !filters.every(([key, value]) => link[key] === value) ? null : link, error: state.linkError ? { message: 'link error' } : null };
        return { data: document, error: state.metadataError ? { message: 'metadata error' } : null };
      } };
      return builder;
    }, delete: () => ({ eq: deleteEq }),
  }));
  const storageFrom = jest.fn(() => ({ createSignedUrl, createSignedUrls, remove }));
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser: jest.fn(async () => ({ data: { user: { id: 'synthetic-user' } }, error: null })) }, from, storage: { from: storageFrom } } as never);
  return { state, rpc, remove, deleteEq, createSignedUrl, createSignedUrls, storageFrom, reads };
}

beforeEach(() => { jest.clearAllMocks(); process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.example.invalid'; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'synthetic-anon'; });
const noSignature = (h: ReturnType<typeof harness>) => { expect(h.createSignedUrl).not.toHaveBeenCalled(); expect(h.createSignedUrls).not.toHaveBeenCalled(); };

it.each(['active', 'archived'])('DELETE refuses a legal namespace for %s before either mutation', async (status) => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', status });
  expect((await DELETE(request())).status).toBe(409);
  expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});
it.each(['old_legal_media', 'documents', 'media', ''])('DELETE refuses foreign bucket %s even without a path', async (bucket) => {
  const h = harness({ bucket, path: '' });
  expect((await DELETE(request())).status).toBe(409);
  expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});
it('DELETE retains the promoted409 before metadata lookup', async () => {
  const h = harness({ bucket: 'legal-documents', status: 'promoted' });
  const response = await DELETE(request());
  expect(response.status).toBe(409); expect((await response.json()).error).toBe('promoted_document');
  expect(h.reads.map((r) => r.table)).toEqual(['actor_document']); expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});
it('DELETE permits missing-file cleanup in actor-documents only', async () => {
  const h = harness({ path: '' });
  expect((await DELETE(request())).status).toBe(200);
  expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).toHaveBeenCalledWith('id', DOC);
});
it('DELETE rechecks namespace before deleting the reference after an admitted remove', async () => {
  const h = harness();
  h.remove.mockImplementationOnce(async () => { h.state.document.storage_bucket = 'legal-documents'; return { error: null }; });
  expect((await DELETE(request())).status).toBe(409);
  expect(h.remove).toHaveBeenCalledTimes(1); expect(h.deleteEq).not.toHaveBeenCalled();
});
it.each(['open', 'delete'])('%s blocks a metadata error instead of signing/deleting', async (action) => {
  const h = harness(); h.state.metadataError = true;
  expect((await (action === 'open' ? open : DELETE)(request())).status).toBeGreaterThanOrEqual(500);
  noSignature(h); expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});
it.each(['open', 'delete'])('%s blocks a link error even with data present', async (action) => {
  const h = harness(); h.state.linkError = true;
  expect((await (action === 'open' ? open : DELETE)(request())).status).toBeGreaterThanOrEqual(500);
  noSignature(h); expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});
it('keeps the exact actor/document link as a prerequisite', async () => {
  const h = harness({ pair: false });
  expect((await open(request())).status).toBe(404); noSignature(h);
});
it.each(['media', 'task-documents', 'avatars'])('open refuses foreign namespace %s before signing', async (bucket) => {
  const h = harness({ bucket }); expect((await open(request())).status).toBe(409); noSignature(h);
});
it('open requires public scope for documents history', async () => {
  const h = harness({ bucket: 'documents', scope: 'legal_private', status: 'promoted' });
  expect((await open(request())).status).toBe(409); noSignature(h);
});
it.each(['old_legal_media', 'legal-documents'])('CRM ORG A alone cannot sign a mapped legal file in B (%s)', async (bucket) => {
  const h = harness({ bucket, scope: 'legal_private' });
  expect((await open(request())).status).toBe(403); noSignature(h);
  expect(h.rpc).toHaveBeenCalledWith('get_object_document_file', { p_object_id: OBJECT, p_document_id: DOC });
});
it.each(['canonical', 'legal'])('expired legal archive opens using the current %s authority and exact locator', async (authority) => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', status: 'archived', canonical: authority === 'canonical', legal: authority === 'legal' });
  const response = await open(request()); expect(response.status).toBe(200);
  expect(h.createSignedUrls).toHaveBeenCalledWith([PATH], 60);
  expect(h.createSignedUrl).not.toHaveBeenCalled();
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  const url = new URL((await response.json()).url);
  expect(decodeURIComponent(url.pathname.slice('/storage/v1/object/sign/legal-documents/'.length))).toBe(PATH);
  expect(url.hash).toBe(''); expect(url.searchParams.get('token')).toBe('synthetic');
  expect(jest.mocked(createClient).mock.calls.every((call) => (call[2]?.global?.headers as Record<string, string>).Authorization === 'Bearer caller-jwt')).toBe(true);
});
it('a revoked legal right on the next request yields no second signature', async () => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', legal: true });
  expect((await open(request())).status).toBe(200); h.state.legal = false;
  expect((await open(request())).status).toBe(403); expect(h.createSignedUrls).toHaveBeenCalledTimes(1);
});
it('wrong mapping does not use a client object hint or CRM fallback', async () => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', mapping: OTHER, canonical: true, legal: true });
  const response = await open({ headers: new Headers({ authorization: 'Bearer caller-jwt' }), json: async () => ({ actorId: ACTOR, documentId: DOC, objectId: OBJECT }) } as never);
  expect(response.status).toBe(404); noSignature(h);
  expect(h.rpc).toHaveBeenCalledWith('get_object_document_file', { p_object_id: OTHER, p_document_id: DOC });
});
it('missing mapping cannot become actor-only legal authorization', async () => {
  const h = harness({ bucket: 'old_legal_media', scope: 'legal_private', mapping: null, canonical: true, legal: true });
  expect((await open(request())).status).toBe(409); noSignature(h);
});
it('promoted legal fallback is only a hint still rechecked by the file RPC', async () => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', mapping: null, status: 'promoted', legal: true });
  expect((await open(request())).status).toBe(200); expect(h.createSignedUrls).toHaveBeenCalledWith([PATH], 60);
});
it('authority read errors never fall back to service signing', async () => {
  const h = harness({ bucket: 'legal-documents', scope: 'legal_private', legal: true }); h.state.rpcError = true;
  expect((await open(request())).status).toBe(503); noSignature(h);
});
it('public promoted history retains CRM-read with no canonical/legal reader dependency', async () => {
  const h = harness({ bucket: 'documents', scope: 'public', status: 'promoted' });
  expect((await open(request())).status).toBe(200);
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(['user_can_read_crm_actor']);
  expect((await DELETE(request())).status).toBe(409);
});

it('the actual PATCH-produced public reference/history still opens after its object link is gone and cannot delete', async () => {
  const targetId = 'bbbbbbbb-1111-4222-a333-cccccccccccc';
  const written: { document?: Row; history?: Row } = {};
  const chain = (data: unknown) => { const q = { eq: () => q, maybeSingle: async () => ({ data, error: null }) }; return q; };
  const source = { storage_bucket: 'actor-documents', storage_path: `actors/${ACTOR}/upload.pdf`, title: 'Uploaded', extra: {} };
  const rpc = jest.fn(async () => ({ data: true, error: null }));
  jest.mocked(createClient).mockReturnValue({ schema: () => ({ rpc }) } as never);
  const remove = jest.fn(async () => ({ error: null }));
  const storageFrom = jest.fn(() => ({
    download: async () => ({ data: new Blob(['synthetic PDF']), error: null }),
    upload: async () => ({ error: null }), remove,
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://storage.example.invalid/storage/v1/object/public/documents/${path}` } }),
  }));
  const from = jest.fn((table: string) => {
    if (table === 'actor' || table === 'object') return { select: () => chain({ is_test: false }) };
    if (table === 'actor_document') return { select: () => chain({ status: 'active', title: 'Uploaded', valid_from: null, valid_to: '2000-01-01' }), update: (value: Row) => {
      written.history = value; return { eq: () => ({ eq: async () => ({ error: null }) }) };
    } };
    if (table === 'ref_code') return { select: () => chain({ id: 'synthetic-role' }) };
    if (table === 'object_document') return { insert: async () => ({ error: null }) };
    return { select: () => chain(source), insert: (value: Row) => {
      written.document = value; return { select: () => ({ single: async () => ({ data: { id: targetId }, error: null }) }) };
    }, delete: () => ({ eq: async () => ({ error: null }) }) };
  });
  jest.mocked(getServerSupabaseClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: { id: 'synthetic-user' } }, error: null }) }, from, storage: { from: storageFrom } } as never);
  const promoted = await PATCH({ headers: new Headers({ authorization: 'Bearer caller-jwt' }), json: async () => ({ actorId: ACTOR, documentId: DOC, objectId: OBJECT, roleCode: 'kbis' }) } as never);
  expect(promoted.status).toBe(200); expect(await promoted.json()).toEqual({ documentId: targetId });
  expect(written.document).toMatchObject({ storage_bucket: 'documents', access_scope: 'public' });
  expect(written.history).toMatchObject({ document_id: targetId, promoted_document_id: targetId, status: 'promoted' });
  const h = harness({ bucket: written.document!.storage_bucket as string, scope: written.document!.access_scope as string,
    path: written.document!.storage_path as string, status: written.history!.status as string, documentId: targetId });
  expect((await open(request(targetId))).status).toBe(200);
  expect(h.rpc.mock.calls.map((c) => c[0])).toEqual(['user_can_read_crm_actor']);
  expect((await DELETE(request(targetId))).status).toBe(409);
  expect(h.remove).not.toHaveBeenCalled(); expect(h.deleteEq).not.toHaveBeenCalled();
});

