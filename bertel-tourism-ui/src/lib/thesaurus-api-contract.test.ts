/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./partner-auth', () => ({ admitPartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('./public-api', () => ({
  callPublicRpc: jest.fn(), publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { NextRequest } from 'next/server';
import { admitPartner } from './partner-auth';
import { callPublicRpc } from './public-api';
import { handleThesaurusRequest, type ThesaurusAction, publicThesaurusConcept } from './thesaurus-api';

const admit = admitPartner as jest.Mock;
const rpc = callPublicRpc as jest.Mock;
const ID = '11111111-1111-4111-8111-111111111111';
const names = { fr: 'Hébergement', en: 'Accommodation', es: 'Alojamiento', de: 'Unterkunft' };
const concept = {
  concept_id: ID, uri: 'https://example.test/concept/' + ID, domain: 'taxonomy_hlo', code: 'lodging',
  name: names.fr, preferred_labels: names, definitions: { fr: 'Définition française.', en: 'English definition.' },
  labels: [], notes: [], sources: [], broader: [], narrower: [], related: [], replaced_by: [], relations: [], mappings: [],
  lifecycle: 'active', assignable: true, valid_from: null, valid_to: null,
};
const domain = { domain: 'taxonomy_hlo', name: names.fr, name_i18n: names, source_kind: 'ref_code' };
const baseMeta = { release_id: 7, previous_release_id: 6, as_of: '2026-11-10T00:00:00Z',
  total: 1, next_after: null, cursor_snapshot: '0123456789abcdef0123456789abcdef', metadata_checksum: 'metadata-md5' };
const rpcResponse = (data: unknown) => ({ ok: true, status: 200, body: { meta: baseMeta, data } });
const urlFor: Record<ThesaurusAction, string> = {
  manifest: '/api/public/thesaurus',
  release: '/api/public/thesaurus/releases/7',
  concepts: '/api/public/thesaurus/releases/7/concepts',
  concept: '/api/public/thesaurus/releases/7/concepts/' + ID,
  resolve: '/api/public/thesaurus/concepts/' + ID,
  changes: '/api/public/thesaurus/releases/7/changes',
  export: '/api/public/thesaurus/releases/7/export',
};
const payloadFor = (action: ThesaurusAction): unknown => {
  if (action === 'manifest' || action === 'release') return { release_id: 7, metadata_checksum: 'metadata-md5',
    domains: [domain], releases: [{ release_id: 7, domains: [domain] }] };
  if (action === 'concept' || action === 'resolve') return concept;
  if (action === 'changes') return [{ concept_id: ID, change_type: 'modified', before: concept, after: concept }];
  return [concept];
};
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(
  'http://localhost' + path, { headers: { authorization: 'Bearer bk_live_' + 'a'.repeat(48), ...headers } });

beforeEach(() => {
  process.env.THESAURUS_CURSOR_SECRET = 'contract-test-cursor-secret-not-a-live-key';
  admit.mockReset().mockResolvedValue({ partner: { keyId: 'partner', label: 'Contract test', scopes: [] },
    rate: { allowed: true, limit: 120, remaining: 119, retryAfter: 0 } });
  rpc.mockReset();
});

test.each(Object.keys(urlFor) as ThesaurusAction[])('documents the actual response boundary for %s', async (action) => {
  rpc.mockResolvedValue(rpcResponse(payloadFor(action)));
  const result = await handleThesaurusRequest(request(urlFor[action]), {
    action, ...(action === 'release' || action === 'concepts' || action === 'concept' || action === 'changes' || action === 'export'
      ? { releaseId: '7' } : {}), ...(action === 'concept' || action === 'resolve' ? { conceptId: ID } : {}),
  });
  expect(result.status).toBe(200);
  const body = await result.json();
  expect(body.meta).toMatchObject({ release_id: 7, vocabulary_release: 7, metadata_checksum: 'metadata-md5' });
  expect(body.meta).not.toHaveProperty('cursor_snapshot');
  expect(body).toHaveProperty('data');
  if (action === 'manifest' || action === 'release') {
    expect(body.data.metadata_scope).toBe('release_snapshot');
    expect(body.data.domains[0]).toMatchObject({ name_i18n: names, requested_lang: 'fr', effective_lang: 'fr' });
    if (action === 'manifest') expect(body.data.releases[0].is_current).toBe(true);
    else expect(body.data).not.toHaveProperty('is_current');
  }
  if (action === 'concepts' || action === 'changes') expect(body.meta).toMatchObject({ page_size: 100, total: 1, next_cursor: null });
  if (action === 'concepts' || action === 'export') expect(Array.isArray(body.data)).toBe(true);
  if (action === 'concept' || action === 'resolve') expect(body.data.concept_id).toBe(ID);
});

test.each(['concepts', 'changes', 'export'] as const)('applies filters only on supported %s requests', async (action) => {
  rpc.mockResolvedValue(rpcResponse(payloadFor(action)));
  const pageSize = action === 'export' ? 100 : 200;
  const pagingParams = action === 'export' ? '' : '&page_size=200';
  const result = await handleThesaurusRequest(request(
    urlFor[action] + '?domains=taxonomy_res,taxonomy_hlo,taxonomy_res&status=retired,active&lang=en-GB' + pagingParams,
  ), { action, releaseId: '7' });
  expect(result.status).toBe(200);
  expect(rpc).toHaveBeenCalledWith('thesaurus_public_edition', { p_action: action, p_release_id: 7,
    p_params: expect.objectContaining({ domains: ['taxonomy_hlo', 'taxonomy_res'], status: ['active', 'retired'], lang: 'en-GB', page_size: pageSize }) });
});

test.each([
  ['manifest', 'domains'], ['manifest', 'status'], ['release', 'domains'], ['release', 'status'],
  ['concept', 'domains'], ['concept', 'status'], ['resolve', 'domains'], ['resolve', 'status'],
] as const)('rejects %s %s instead of silently ignoring it', async (action, key) => {
  const param = key === 'domains' ? 'taxonomy_hlo' : 'active';
  const result = await handleThesaurusRequest(request(urlFor[action] + '?' + key + '=' + param), {
    action, ...(action === 'release' || action === 'concept' ? { releaseId: '7' } : {}),
    ...(action === 'concept' || action === 'resolve' ? { conceptId: ID } : {}),
  });
  expect(result.status).toBe(400);
  expect(await result.json()).toEqual({ error: 'invalid_parameters' });
  expect(rpc).not.toHaveBeenCalled();
});

test('localizes a concept from exact or primary language, preserves maps, and labels scalar French fallbacks honestly', () => {
  const mapped = publicThesaurusConcept(concept, 'en-GB');
  expect(mapped).toMatchObject({ name: 'Accommodation', requested_lang: 'en-GB', effective_lang: 'en' });
  expect(mapped.preferred_labels).toEqual(names);
  expect(mapped.definitions).toEqual(concept.definitions);
  const germanOnly = publicThesaurusConcept({ ...concept, name: 'Nom français canonique', description: 'Description française canonique',
    preferred_labels: { de: 'Unterkunft' }, definitions: { de: 'Deutsche Definition.' } }, 'en');
  expect(germanOnly).toMatchObject({ name: 'Nom français canonique', description: 'Description française canonique',
    effective_lang: 'fr', definition_lang: 'fr', preferred_labels: { de: 'Unterkunft' }, definitions: { de: 'Deutsche Definition.' } });
  const legacy = publicThesaurusConcept({ ...concept, name: 'Nom français historique', preferred_labels: {}, definitions: {}, description: 'Description historique' }, 'en');
  expect(legacy).toMatchObject({ name: 'Nom français historique', description: 'Description historique', requested_lang: 'en',
    effective_lang: 'fr', definition_lang: 'fr', preferred_labels: {}, definitions: {} });
  const unknownLanguage = publicThesaurusConcept({ ...concept, name: '', description: '', preferred_labels: {}, definitions: {} }, 'en');
  expect(unknownLanguage).toMatchObject({ requested_lang: 'en', effective_lang: null, definition_lang: null,
    preferred_labels: {}, definitions: {} });
});

test('adds a truthful legacy French fallback alongside a partial stored name map', async () => {
  rpc.mockResolvedValue(rpcResponse({ release_id: 7, domains: [
    { domain: 'taxonomy_hlo', name: 'Legacy French name', name_i18n: { de: 'Deutscher Name' } },
  ] }));
  const result = await handleThesaurusRequest(request(urlFor.release + '?lang=en'), { action: 'release', releaseId: '7' });
  const body = await result.json();
  expect(body.data.domains[0]).toMatchObject({ name: 'Legacy French name',
    name_i18n: { fr: 'Legacy French name', de: 'Deutscher Name' }, requested_lang: 'en', effective_lang: 'fr',
    name_metadata_scope: 'release_snapshot' });
});

test('JSON-LD preserves the complete language maps when a translated representation is requested', async () => {
  rpc.mockResolvedValue(rpcResponse([concept]));
  const result = await handleThesaurusRequest(request(urlFor.export + '?lang=es&format=jsonld'), { action: 'export', releaseId: '7' });
  expect(result.status).toBe(200);
  expect(result.headers.get('content-type')).toContain('application/ld+json');
  const body = await result.json();
  expect(body['@graph'][0].prefLabel).toEqual(names);
  expect(body['@graph'][0].definition).toEqual(concept.definitions);
});

test('localization changes ETags and a matching validator returns bodyless 304', async () => {
  rpc.mockResolvedValue(rpcResponse(payloadFor('manifest')));
  const fr = await handleThesaurusRequest(request(urlFor.manifest + '?lang=fr'), { action: 'manifest' });
  const en = await handleThesaurusRequest(request(urlFor.manifest + '?lang=en'), { action: 'manifest' });
  expect(fr.headers.get('etag')).not.toBe(en.headers.get('etag'));
  const cached = await handleThesaurusRequest(request(urlFor.manifest + '?lang=en', { 'if-none-match': en.headers.get('etag')! }), { action: 'manifest' });
  expect(cached.status).toBe(304);
  expect(await cached.text()).toBe('');
});

