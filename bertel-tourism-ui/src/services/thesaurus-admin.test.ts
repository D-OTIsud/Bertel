import { getSupabaseClient } from '../lib/supabase';
import {
  bootstrapThesaurus, discardThesaurusDraft, fetchThesaurusWorkspace, normalizeThesaurusDocument, rebaseThesaurusDraft,
  previewThesaurusPublication, publishThesaurus, saveThesaurusDraft,
  thesaurusErrorMessage, validateThesaurusDraft, pingThesaurusNotifyDrain, retryThesaurusOutbox,
} from './thesaurus-admin';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));
const getClient = jest.mocked(getSupabaseClient);
const document = normalizeThesaurusDocument({ code: 'appartement', name: 'Appartement', lifecycle: 'active', labels: [{ lang: 'fr', kind: 'alt', value: 'Appart' }] });
const revision = { revision_id: 'rev-1', concept_id: 'concept-1', domain: 'taxonomy_hlo', version: 3, status: 'draft', document, errors: [], warnings: [] };
function rpcClient(rpc: jest.Mock) { return { schema: jest.fn().mockReturnValue({ rpc }) } as never; }

describe('thesaurus administration network contract', () => {
  beforeEach(() => getClient.mockReset());

  it('sends full concept identity and optimistic version with the draft document', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: revision, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    const saved = await saveThesaurusDraft({ concept_id: 'concept-1', domain: 'taxonomy_hlo', expected_version: 2, document });
    expect(rpc).toHaveBeenCalledWith('thesaurus_admin', { p_action: 'save_draft', p_payload: { concept_id: 'concept-1', domain: 'taxonomy_hlo', expected_version: 2, document } });
    expect(saved.version).toBe(3);
    expect(saved.document.labels).toEqual([{ lang: 'fr', kind: 'alt', value: 'Appart' }]);
  });

  it('validates exactly the saved revision version', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { ...revision, status: 'validated' }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    await validateThesaurusDraft('rev-1', 3);
    expect(rpc).toHaveBeenCalledWith('thesaurus_admin', { p_action: 'validate_draft', p_payload: { revision_id: 'rev-1', expected_version: 3 } });
  });

  it('binds publication to reviewed versions, base release and fingerprint', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { release_id: 8, previous_release_id: 7, changed_count: 1, affected_objects: 12 }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    const input = { revision_ids: ['rev-1'], expected_revision_versions: { 'rev-1': 3 }, expected_release_id: 7, idempotency_key: 'request-1', preview_fingerprint: 'fingerprint' };
    await publishThesaurus(input);
    expect(rpc).toHaveBeenCalledWith('thesaurus_admin', { p_action: 'publish', p_payload: input });
  });

  it('preserves preview validation errors instead of reporting an eligible publication', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { errors: [{ code: 'cycle', message: 'La hiérarchie contient un cycle.' }], warnings: [], changed_count: 1, affected_objects: 2, changes: [], preview_fingerprint: 'p1' }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    const preview = await previewThesaurusPublication(['rev-1'], { 'rev-1': 3 });
    expect(preview.errors).toEqual([{ code: 'cycle', message: 'La hiérarchie contient un cycle.' }]);
    expect(preview.preview_fingerprint).toBe('p1');
  });

  it('normalizes the actual paginated requalification object and never invents a French synonym for imported aliases', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: {
      domains: [{ domain: 'taxonomy_hlo', name: 'Hébergements', is_governed: true }],
      concepts: [{ ...document, concept_id: 'concept-1', domain: 'taxonomy_hlo', metadata: { aliases: ['Legacy unknown language'] } }],
      revisions: [], releases: [], latest_release_id: null,
      requalification: { items: [{ object_id: 'HLO1', object_name: 'La maison', concept_id: 'concept-1', name: 'Appartement', lifecycle: 'retired' }], total: 1 },
    }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    const result = await fetchThesaurusWorkspace({ domain: 'taxonomy_hlo', query: 'Appart', offset: 100, page_size: 100 });
    expect(result.requalification[0]).toMatchObject({ object_id: 'HLO1', concept_name: 'Appartement', lifecycle: 'retired' });
    expect(result.concepts[0].labels).toEqual(document.labels);
    expect(result.concepts[0].usage_count).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith('thesaurus_admin', { p_action: 'workspace', p_payload: { domain: 'taxonomy_hlo', query: 'Appart', offset: 100, page_size: 100 } });
  });

  it('bootstraps only explicitly selected domains', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { release_id: 1 }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    await bootstrapThesaurus(['taxonomy_hlo']);
    expect(rpc).toHaveBeenCalledWith('thesaurus_admin', { p_action: 'bootstrap', p_payload: { domains: ['taxonomy_hlo'] } });
  });

  it('reads publication counts from the persisted SQL release manifests', async () => {
    // workspace returns to_jsonb(thesaurus.release): changed_count belongs to
    // its stored manifest, whereas a direct publish response has it at the top.
    const releases = [15, 11, 1293].map((changedCount, index) => ({
      release_id: index + 1,
      previous_release_id: index || null,
      as_of: '2026-11-06T18:00:00Z',
      affected_objects: 0,
      manifest: { release_id: index + 1, changed_count: changedCount },
    }));
    const rpc = jest.fn().mockResolvedValue({ data: { domains: [], concepts: [], releases, latest_release_id: 3 }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));

    const result = await fetchThesaurusWorkspace();

    expect(result.releases.map((release) => release.changed_count)).toEqual([15, 11, 1293]);
  });

  it('preserves explicit top-level counts including zero and defaults missing manifests to zero', async () => {
    const releases = [
      { release_id: 1, changed_count: 0, manifest: { changed_count: 15 } },
      { release_id: 2, changed_count: 11 },
      { release_id: 3, manifest: { changed_count: 1293 } },
      { release_id: 4 },
      { release_id: 5, manifest: null },
    ];
    const rpc = jest.fn().mockResolvedValue({ data: { domains: [], concepts: [], releases }, error: null });
    getClient.mockReturnValue(rpcClient(rpc));

    const result = await fetchThesaurusWorkspace();

    expect(result.releases.map((release) => release.changed_count)).toEqual([0, 11, 1293, 0, 0]);
  });

  it('refuses malformed success responses and explains a conflict without dropping user input', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: {}, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    await expect(saveThesaurusDraft({ concept_id: null, domain: 'taxonomy_hlo', expected_version: 0, document })).rejects.toThrow(/malformée/);
    expect(thesaurusErrorMessage(new Error('PT409 REVISION_CONFLICT'))).toMatch(/saisie est conservée/);
  });

  it('keeps the French canonical field separate from translations and never promotes untyped legacy labels', () => {
    const normalized = normalizeThesaurusDocument({ name: 'Appartement', name_i18n: { fr: 'Ancien libellé', en: 'Apartment' }, relations: [{ type: 'replaced_by', target_id: 'successor' }], replaced_by: ['successor'] });
    expect(normalized.name).toBe('Appartement');
    expect(normalized.name_i18n).toEqual({ en: 'Apartment' });
    expect(normalized.relations).toEqual([]);
    expect(normalized.replaced_by).toEqual(['successor']);
    expect(() => normalizeThesaurusDocument({ labels: [{ kind: 'alt', value: 'Legacy without language' }] })).toThrow(/langue/);
    expect(() => normalizeThesaurusDocument({ notes: [{ type: 'source', value: 'Legacy without language' }] })).toThrow(/langue/);
  });

  it('preserves the PostgREST conflict code even when the server message has no literal conflict marker', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: 'PT409', message: 'Revision changed; reload before saving' } });
    getClient.mockReturnValue(rpcClient(rpc));
    let failure: unknown;
    try { await saveThesaurusDraft({ concept_id: 'concept-1', domain: 'taxonomy_hlo', expected_version: 2, document }); } catch (error) { failure = error; }
    expect(thesaurusErrorMessage(failure)).toMatch(/Votre saisie est conservée/);
    expect(thesaurusErrorMessage(new Error('PT400: Invalid draft: ["Le libellé français est requis."]'))).toBe('Le libellé français est requis.');
  });

  it('binds recovery and discard to the expected draft version', async () => {
    const rpc = jest.fn().mockResolvedValue({ data: revision, error: null });
    getClient.mockReturnValue(rpcClient(rpc));
    await rebaseThesaurusDraft('rev-1', 3);
    await discardThesaurusDraft('rev-1', 4);
    expect(rpc).toHaveBeenNthCalledWith(1, 'thesaurus_admin', { p_action: 'rebase_draft', p_payload: { revision_id: 'rev-1', expected_version: 3 } });
    expect(rpc).toHaveBeenNthCalledWith(2, 'thesaurus_admin', { p_action: 'discard_draft', p_payload: { revision_id: 'rev-1', expected_version: 4 } });
  });

  it('drains publication, bootstrap and explicit retries with the current authenticated session', async () => {
    const originalFetch = global.fetch;
    const fetcher = jest.fn().mockResolvedValue({ ok: true });
    global.fetch = fetcher;
    try {
      const rpc = jest.fn().mockResolvedValue({ data: { release_id: 8 }, error: null });
      const getSession = jest.fn().mockResolvedValue({ data: { session: { access_token: 'current-session' } } });
      getClient.mockReturnValue({ schema: () => ({ rpc }), auth: { getSession } } as never);
      await publishThesaurus({ revision_ids: [], expected_revision_versions: {}, expected_release_id: 7, idempotency_key: 'batch' });
      await bootstrapThesaurus(['taxonomy_hlo']);
      await retryThesaurusOutbox('12');
      expect(fetcher).toHaveBeenCalledTimes(3);
      expect(fetcher).toHaveBeenCalledWith('/api/admin/thesaurus/notify-drain', {
        method: 'POST', headers: { Authorization: 'Bearer current-session' },
      });
    } finally { global.fetch = originalFetch; }
  });

  it('keeps a successful publication when the outbox drain fails and skips missing sessions', async () => {
    const originalFetch = global.fetch;
    const fetcher = jest.fn().mockRejectedValue(new Error('network unavailable'));
    global.fetch = fetcher;
    try {
      const rpc = jest.fn().mockResolvedValue({ data: { release_id: 8 }, error: null });
      const getSession = jest.fn().mockResolvedValue({ data: { session: { access_token: 'current-session' } } });
      getClient.mockReturnValue({ schema: () => ({ rpc }), auth: { getSession } } as never);
      await expect(publishThesaurus({ revision_ids: [], expected_revision_versions: {}, expected_release_id: 7, idempotency_key: 'batch' })).resolves.toMatchObject({ release_id: 8 });
      getSession.mockResolvedValue({ data: { session: null } });
      await pingThesaurusNotifyDrain();
      expect(fetcher).toHaveBeenCalledTimes(1);
    } finally { global.fetch = originalFetch; }
  });
});
