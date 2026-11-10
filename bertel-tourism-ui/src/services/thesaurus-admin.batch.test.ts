import { getSupabaseClient } from '../lib/supabase';
import { analyseThesaurusImport, fetchThesaurusWorkspace, importThesaurusCorrections, validateThesaurusImport } from './thesaurus-admin';
import type { ThesaurusContentBatch } from '../lib/thesaurus-content-batch';

jest.mock('../lib/supabase', () => ({ getSupabaseClient: jest.fn() }));
const getClient = jest.mocked(getSupabaseClient);
const id = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
const proposal = (index: number) => ({ concept_id: id(index), domain: 'booking_status', context_key: '', code: `status_${index}`, base: { description_i18n: { fr: 'Ancien sens.', en: 'Old meaning.' } }, changes: { description_i18n: { fr: 'État interne de la réservation.', en: 'Internal booking status.' } } });
const batch = (length = 1): ThesaurusContentBatch => ({ format_version: 1, batch_id: 'internal-statuses', proposals: Array.from({ length }, (_, index) => proposal(index + 1)) });
const concept = (index: number) => ({ ...proposal(index), name: `État ${index}`, description_i18n: proposal(index).base.description_i18n, source_fingerprint: 'a'.repeat(32), revision: null });
const revision = (conceptId: string, index = 1) => ({ revision_id: id(index + 10000), concept_id: conceptId, domain: 'booking_status', version: 1, status: 'draft', document: { name: 'État interne' }, errors: [], warnings: [] });
function connect(handler: (action: string, payload: Record<string, unknown>) => unknown) {
  const rpc = jest.fn(async (_fn, args) => ({ data: await handler(args.p_action, args.p_payload), error: null }));
  getClient.mockReturnValue({ schema: jest.fn().mockReturnValue({ rpc }) } as never);
  return rpc;
}
function page(concepts: unknown[]) { return { capabilities: { content_proposal_preconditions: 1, read_only_workspace: 1 }, domains: [], concepts }; }

describe('authenticated private correction import', () => {
  beforeEach(() => getClient.mockReset());
  it('reads internal targets by 200, preserves exact French maps and creates atomic groups of at most 100', async () => {
    const input = batch(201);
    let ordinal = 0;
    const rpc = connect((action, payload) => {
      if (action === 'workspace') return page((payload.concept_ids as string[]).map((target) => concept(Number(target.slice(-12)))));
      if (action === 'save_drafts') return { items: (payload.items as Array<{ concept_id: string }>).map((item) => revision(item.concept_id, ++ordinal)) };
      throw new Error(`Unexpected action ${action}`);
    });
    const progress = jest.fn();
    const result = await importThesaurusCorrections(input, progress);
    expect(result.revisions).toHaveLength(201);
    expect(result.error).toBeUndefined();
    const calls = rpc.mock.calls.map(([, args]) => args);
    expect(calls.filter((call) => call.p_action === 'workspace').map((call) => call.p_payload.concept_ids.length)).toEqual([200, 1]);
    expect(calls[0].p_payload).toMatchObject({ read_only: true, include_internal: true, include_revisions: false, page_size: 200, offset: 0 });
    const writes = calls.filter((call) => call.p_action === 'save_drafts');
    expect(writes.map((call) => call.p_payload.items.length)).toEqual([100, 100, 1]);
    expect(writes[0].p_payload.items[0]).toEqual({ concept_id: id(1), domain: 'booking_status', expected_version: 0, expected_source_fingerprint: 'a'.repeat(32), only_if_no_revision: true, document: input.proposals[0].changes });
    expect(calls.every((call) => ['workspace', 'save_drafts'].includes(call.p_action))).toBe(true);
    expect(progress).toHaveBeenLastCalledWith({ completed: 201, total: 201 });
  });
  it('blocks every write when even one target has an existing draft, and fresh analysis catches a concurrent change', async () => {
    let changed = false;
    const rpc = connect((action) => {
      if (action !== 'workspace') throw new Error('Must never write');
      return page([changed ? { ...concept(1), revision: { revision_id: 'existing' } } : concept(1)]);
    });
    expect((await analyseThesaurusImport(batch())).results[0].status).toBe('ready');
    changed = true;
    const result = await importThesaurusCorrections(batch());
    expect(result.analysis.results[0].status).toBe('conflict');
    expect(result.revisions).toEqual([]);
    expect(rpc.mock.calls.every(([, args]) => args.p_action === 'workspace')).toBe(true);
  });
  it('reports confirmed prior groups and stops after an atomic conflict without retrying later groups', async () => {
    let writes = 0;
    const rpc = connect((action, payload) => {
      if (action === 'workspace') return page((payload.concept_ids as string[]).map((target) => concept(Number(target.slice(-12)))));
      if (++writes === 2) throw new Error('PT409: canonical source changed');
      return { items: (payload.items as Array<{ concept_id: string }>).map((item, index) => revision(item.concept_id, index + 1)) };
    });
    const result = await importThesaurusCorrections(batch(201));
    expect(result.revisions).toHaveLength(100);
    expect(result.error).toMatch(/contenu a changé/);
    expect(result.uncertain).toBe(false);
    expect(rpc.mock.calls.filter(([, args]) => args.p_action === 'save_drafts')).toHaveLength(2);
  });
  it('never interprets a lost or malformed save response as a confirmed empty write', async () => {
    connect((action) => action === 'workspace' ? page([concept(1)]) : { items: [] });
    const result = await importThesaurusCorrections(batch());
    expect(result.revisions).toEqual([]);
    expect(result.uncertain).toBe(true);
    expect(result.error).toMatch(/incomplète/);
  });
  it('supports older lots without UUIDs through qualified domain reads', async () => {
    const input = batch(); delete input.proposals[0].concept_id;
    const rpc = connect(() => page([concept(1)]));
    expect((await analyseThesaurusImport(input)).results[0].status).toBe('ready');
    expect(rpc.mock.calls[0][1].p_payload).toMatchObject({ domain: 'booking_status', include_internal: true });
  });
  it('validates saved versions only as a separate action and preserves server rejections', async () => {
    const rpc = connect((action, payload) => {
      if (action !== 'validate_drafts') throw new Error('No implicit publish or save');
      return { items: (payload.items as Array<{ revision_id: string }>).map((item) => ({ ...revision(id(1)), revision_id: item.revision_id, status: 'draft', errors: ['La définition allemande est requise.'] })) };
    });
    const { normalizeThesaurusRevision } = await import('./thesaurus-admin');
    const pending = normalizeThesaurusRevision(revision(id(1)));
    const result = await validateThesaurusImport([pending]);
    expect(rpc.mock.calls[0][1]).toEqual({ p_action: 'validate_drafts', p_payload: { items: [{ revision_id: pending.revision_id, expected_version: 1 }] } });
    expect(result.revisions[0].status).toBe('draft');
    expect(result.revisions[0].errors[0].message).toMatch(/allemande/);
  });
  it('normalizes mandatory languages and forwards complete workspace pagination controls', async () => {
    connect(() => ({ domains: [{ domain: 'booking_status', required_languages: ['de', 'en', 'de'] }], concepts: [] }));
    const result = await fetchThesaurusWorkspace({ include_internal: true, revision_page_size: 2000, revision_offset: 2000 });
    expect(result.domains[0].required_languages).toEqual(['fr', 'de', 'en']);
  });
});
