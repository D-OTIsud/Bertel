/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./partner-auth', () => ({ admitPartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('./public-api', () => ({
  callPublicRpc: jest.fn(),
  publicHeaders: () => ({ 'X-Bertel-Api-Version': '1.0.0' }),
  PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { createHash } from 'node:crypto';
import { NextRequest } from 'next/server';
import { admitPartner, logPartnerCall } from './partner-auth';
import { callPublicRpc } from './public-api';
import { canonicalThesaurusJson, decodeThesaurusCursor, handleThesaurusRequest } from './thesaurus-api';
import { compactConcept, compactManifestData } from './thesaurus-compact-projection';

const admission = admitPartner as jest.Mock;
const rpc = callPublicRpc as jest.Mock;
const audit = logPartnerCall as jest.Mock;
const ID = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const SNAPSHOT = '0123456789abcdef0123456789abcdef';
const concept = {
  concept_id: ID, uri: `https://bertel.example/api/public/thesaurus/concepts/${ID}`,
  domain: 'taxonomy_hlo', code: 'appartement', context_key: '', name: 'Appartement',
  preferred_labels: { fr: 'Appartement', en: 'Apartment' }, definitions: { fr: 'Logement dans un immeuble.' },
  labels: [{ lang: 'fr', kind: 'alt', value: 'Appart' }],
  notes: [{ lang: 'fr', type: 'scope', value: 'Une unité de logement.', source: 'Guide métier' }],
  broader: [], narrower: [OTHER], related: [], replaced_by: [], relations: [],
  mappings: [{ type: 'closeMatch', target_uri: 'https://example.org/concept/flat', vocabulary: 'Example', source: 'Décision validée' }],
  lifecycle: 'active', assignable: true, valid_from: null, valid_to: null,
};
const activityVocabulary = {
  domain: 'activity_type', name: 'Types d’activité', source_kind: 'ref_code',
  require_definition: false, required_languages: ['fr'],
};

function req(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/thesaurus/releases/1/concepts${query}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...headers },
  });
}
function manifestReq(query = '', headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost/api/public/thesaurus${query}`, {
    headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...headers },
  });
}
function response(data: unknown = [concept], extraMeta = {}) {
  return { ok: true, status: 200, body: { meta: { release_id: 1, previous_release_id: null,
    as_of: '2026-11-06T12:00:00Z', total: 1, next_after: null, cursor_snapshot: SNAPSHOT, ...extraMeta }, data } };
}
/** Scope digest used by the historical full concept list; compact must not change it. */
function legacyConceptScope(pageSize: number): string {
  return createHash('sha256').update(canonicalThesaurusJson({ action: 'concepts', domains: [], status: [],
    lang: 'fr', query: null, page_size: pageSize, format: 'json', series: 'official' })).digest('hex');
}

beforeEach(() => {
  process.env.THESAURUS_CURSOR_SECRET = 'test-thesaurus-cursor-secret-not-a-live-key';
  admission.mockReset(); rpc.mockReset(); audit.mockReset();
  admission.mockResolvedValue({ partner: { keyId: 'key', label: 'Partner', scopes: [] },
    rate: { allowed: true, limit: 120, remaining: 119, retryAfter: 0 } });
  audit.mockResolvedValue(undefined);
  rpc.mockResolvedValue(response());
});

describe('compact concept projection', () => {
  it('keeps the required core with explicit nulls when no label exists', () => {
    const row = compactConcept({ concept_id: ID, domain: 'd', code: 'c', lifecycle: 'active', assignable: false,
      name: undefined, effective_lang: null });
    expect(row).toEqual({ concept_id: ID, domain: 'd', code: 'c', name: null, effective_lang: null,
      lifecycle: 'active', assignable: false });
  });

  it('rejects a structurally invalid core instead of inventing values', () => {
    expect(() => compactConcept({ concept_id: ID, domain: 'd', code: 'c', assignable: true })).toThrow('invalid_snapshot');
  });

  it.each(['', '   '])('omits an empty description carried by a historical scalar (%j)', async (description) => {
    rpc.mockResolvedValue(response([{ ...concept, description, definitions: {} }]));
    const body = await (await handleThesaurusRequest(req('?view=compact'), { action: 'concepts', releaseId: '1' })).json();
    expect(body.data[0]).not.toHaveProperty('description');
    expect(body.data[0]).not.toHaveProperty('definition_lang');
  });

  it('keeps nullable attribution fields explicit when an old manifest lacks them', () => {
    expect(compactManifestData({ domains: [] }, false)).toEqual({ license: null, attribution: null, domains: [] });
  });

  it('keeps only the compact manifest fields and never nests releases in history', () => {
    const data = compactManifestData({ license: 'L', attribution: 'A', domains: [{ domain: 'x', name: 'X', effective_lang: 'fr', extra: 1 }],
      releases: [{ release_id: 1, previous_release_id: null, as_of: 'T', domains: [], checksum: 'c' }] }, false);
    expect(data).toEqual({ license: 'L', attribution: 'A', domains: [{ domain: 'x', name: 'X', effective_lang: 'fr' }] });
  });
});

describe('view=compact over HTTP', () => {
  it('rejects unknown, duplicate, empty and misplaced view parameters before any RPC call', async () => {
    for (const query of ['?view=full', '?view=', '?view=compact&view=compact', '?view=COMPACT']) {
      const result = await handleThesaurusRequest(req(query), { action: 'concepts', releaseId: '1' });
      expect(result.status).toBe(400);
      expect(await result.json()).toEqual({ error: 'invalid_parameters' });
    }
    for (const target of [{ action: 'concept' as const, conceptId: ID }, { action: 'changes' as const, releaseId: '1' },
      { action: 'export' as const, releaseId: '1' }]) {
      const result = await handleThesaurusRequest(req('?view=compact'), target);
      expect(result.status).toBe(400);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns a compact concept list with fallback names, optional fields and no private fields', async () => {
    const rich = { ...concept, context_key: 'hotel', valid_from: '2020-01-01', valid_to: '2030-12-31',
      member_of: [OTHER], replaced_by: [OTHER], broader: [OTHER], internal_review: 'secret-review' };
    rpc.mockResolvedValue(response([rich]));
    const result = await handleThesaurusRequest(req('?view=compact'), { action: 'concepts', releaseId: '1' });
    const text = await result.text();
    const body = JSON.parse(text);
    expect(body.meta).toEqual({ contract_version: '1.0.0', release_id: 1, total: 1, next_cursor: null });
    expect(body.data[0]).toEqual({ concept_id: ID, domain: 'taxonomy_hlo', code: 'appartement', name: 'Appartement',
      effective_lang: 'fr', lifecycle: 'active', assignable: true, context_key: 'hotel',
      description: 'Logement dans un immeuble.', definition_lang: 'fr', valid_from: '2020-01-01', valid_to: '2030-12-31',
      broader: [OTHER], member_of: [OTHER], replaced_by: [OTHER] });
    expect(text).not.toContain('secret-review');
    expect(body.data[0]).not.toHaveProperty('uri');
    expect(body.data[0]).not.toHaveProperty('notes');
  });

  it('uses published translations with an honest fallback language and never invents one', async () => {
    rpc.mockResolvedValue(response([concept]));
    const english = await (await handleThesaurusRequest(req('?view=compact&lang=en'), { action: 'concepts', releaseId: '1' })).json();
    expect(english.data[0]).toMatchObject({ name: 'Apartment', effective_lang: 'en' });
    expect(english.data[0].definition_lang).toBe('fr');
    const spanish = await (await handleThesaurusRequest(req('?view=compact&lang=es'), { action: 'concepts', releaseId: '1' })).json();
    expect(spanish.data[0]).toMatchObject({ name: 'Appartement', effective_lang: 'fr' });
  });

  it('omits absent optional fields in the compact view while keeping the name null', async () => {
    const sparse = { ...concept, name: undefined, preferred_labels: {}, definitions: {}, context_key: '',
      broader: [], member_of: [], replaced_by: [], valid_from: null, valid_to: null };
    rpc.mockResolvedValue(response([sparse]));
    const body = await (await handleThesaurusRequest(req('?view=compact'), { action: 'concepts', releaseId: '1' })).json();
    expect(body.data[0]).toEqual({ concept_id: ID, domain: 'taxonomy_hlo', code: 'appartement', name: null,
      effective_lang: null, lifecycle: 'active', assignable: true });
  });

  it('keeps the historical full list, its fields and its cursor scope digest when view is absent', async () => {
    rpc.mockResolvedValue(response([concept], { next_after: OTHER, total: 2 }));
    const result = await handleThesaurusRequest(req('?page_size=1'), { action: 'concepts', releaseId: '1' });
    const body = await result.json();
    expect(body.data[0]).toHaveProperty('uri');
    expect(body.data[0]).toHaveProperty('notes');
    expect(body.meta).toHaveProperty('vocabulary_release', 1);
    expect(decodeThesaurusCursor(body.meta.next_cursor, 1, legacyConceptScope(1))).toEqual({ after: OTHER, snapshot: SNAPSHOT });
  });

  it('rejects cursors across views in both directions and accepts the compact own cursor', async () => {
    rpc.mockResolvedValue(response([concept], { next_after: OTHER, total: 2 }));
    const full = await (await handleThesaurusRequest(req('?page_size=1'), { action: 'concepts', releaseId: '1' })).json();
    const compact = await (await handleThesaurusRequest(req('?page_size=1&view=compact'), { action: 'concepts', releaseId: '1' })).json();
    const fullTry = await handleThesaurusRequest(req(`?page_size=1&cursor=${encodeURIComponent(compact.meta.next_cursor)}`),
      { action: 'concepts', releaseId: '1' });
    expect(fullTry.status).toBe(400);
    expect(await fullTry.json()).toEqual({ error: 'invalid_cursor' });
    const compactTry = await handleThesaurusRequest(req(`?page_size=1&view=compact&cursor=${encodeURIComponent(full.meta.next_cursor)}`),
      { action: 'concepts', releaseId: '1' });
    expect(compactTry.status).toBe(400);
    const own = await handleThesaurusRequest(req(`?page_size=1&view=compact&cursor=${encodeURIComponent(compact.meta.next_cursor)}`),
      { action: 'concepts', releaseId: '1' });
    expect(own.status).toBe(200);
  });

  it('gives compact responses their own validator and keeps full validators unchanged', async () => {
    const compact = await handleThesaurusRequest(req('?view=compact'), { action: 'concepts', releaseId: '1' });
    const compactEtag = compact.headers.get('etag')!;
    const repeated = await handleThesaurusRequest(req('?view=compact', { 'if-none-match': compactEtag }), { action: 'concepts', releaseId: '1' });
    expect(repeated.status).toBe(304);
    const full = await handleThesaurusRequest(req(), { action: 'concepts', releaseId: '1' });
    expect(full.headers.get('etag')).not.toBe(compactEtag);
    const crossed = await handleThesaurusRequest(req('', { 'if-none-match': compactEtag }), { action: 'concepts', releaseId: '1' });
    expect(crossed.status).toBe(200);
  });

  it('projects discovery to a flat release history without nested manifests', async () => {
    rpc.mockResolvedValue(response({ release_id: 1, license: 'CC-BY-4.0', attribution: 'Bertel', total_concepts: 42,
      domains: [activityVocabulary], releases: [{ release_id: 1, previous_release_id: null, as_of: '2026-11-06T12:00:00Z',
        checksum: 'c', domains: [activityVocabulary] }] }));
    const body = await (await handleThesaurusRequest(manifestReq('?view=compact'), { action: 'manifest' })).json();
    expect(Object.keys(body.meta).sort()).toEqual(['as_of', 'contract_version', 'previous_release_id', 'release_id']);
    expect(body.data).toEqual({ license: 'CC-BY-4.0', attribution: 'Bertel',
      domains: [{ domain: 'activity_type', name: 'Types d’activité', effective_lang: 'fr' }],
      releases: [{ release_id: 1, previous_release_id: null, as_of: '2026-11-06T12:00:00Z' }] });
  });

  it('projects a standalone release without discovery history or counters', async () => {
    rpc.mockResolvedValue(response({ release_id: 1, metadata_checksum: 'm', license: 'CC-BY-4.0', total_concepts: 42,
      domains: [activityVocabulary], releases: [{ release_id: 1, previous_release_id: null, as_of: 'T' }] }));
    const body = await (await handleThesaurusRequest(manifestReq('?view=compact'), { action: 'release', releaseId: '1' })).json();
    expect(body.data).toEqual({ license: 'CC-BY-4.0', attribution: null, domains: [{ domain: 'activity_type', name: 'Types d’activité', effective_lang: 'fr' }] });
    expect(body.meta).not.toHaveProperty('metadata_checksum');
  });
});
