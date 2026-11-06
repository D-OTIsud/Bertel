import test from 'node:test';
import assert from 'node:assert/strict';
import { createRpc, loadWorkspace, proposeContentBatch, validateBatch } from './propose-content.mjs';

const ID = '11111111-1111-4111-8111-111111111111';
const REV = '22222222-2222-4222-8222-222222222222';
const fp = 'a'.repeat(32);
const proposal = { domain: 'taxonomy_hlo', context_key: '', code: 'appartement',
  base: { name: 'Appartement' }, changes: { name: 'Appartement meublé' } };
const batch = { format_version: 1, batch_id: 'bertel-content-2026-11', proposals: [proposal] };
const concept = { concept_id: ID, domain: 'taxonomy_hlo', context_key: '', code: 'appartement',
  name: 'Appartement', source_fingerprint: fp, revision: null };
const workspace = { concepts: [concept] };

test('default dry-run identifies a proposal and never writes', async () => {
  const report = await proposeContentBatch(batch, workspace, { rpc: () => assert.fail('Unexpected RPC') });
  assert.equal(report.mode, 'dry-run');
  assert.equal(report.results[0].status, 'ready');
  assert.equal(report.results[0].source_fingerprint, fp);
});

test('local drafts, canonical adaptations and stale fingerprints remain untouched', async () => {
  for (const [changed, reason] of [
    [{ revision: { revision_id: REV, version: 3 } }, 'local_revision_exists'],
    [{ name: 'Appartement adapté par cette instance' }, 'local_content_changed'],
    [{ source_fingerprint: 'b'.repeat(32) }, 'source_changed'],
  ]) {
    const input = { ...batch, proposals: [{ ...proposal, expected_source_fingerprint: fp }] };
    const report = await proposeContentBatch(input, { concepts: [{ ...concept, ...changed }] },
      { apply: true, rpc: () => assert.fail('Conflict must not write') });
    assert.equal(report.results[0].status, 'conflict');
    assert.equal(report.results[0].reason, reason);
  }
});

test('any preflight conflict prevents all writes in the batch', async () => {
  const input = { ...batch, proposals: [proposal, { ...proposal, code: 'missing' }] };
  const report = await proposeContentBatch(input, workspace, { apply: true, rpc: () => assert.fail('Unexpected write') });
  assert.deepEqual(report.results.map((item) => item.status), ['ready', 'conflict']);
});

test('apply only creates an unvalidated draft with exact optimistic server preconditions', async () => {
  const calls = [];
  const report = await proposeContentBatch(batch, workspace, { apply: true, rpc: async (action, payload) => {
    calls.push({ action, payload }); return { revision_id: REV, version: 1, status: 'draft' };
  } });
  assert.deepEqual(calls, [{ action: 'save_draft', payload: { concept_id: ID, domain: 'taxonomy_hlo',
    expected_version: 0, expected_source_fingerprint: fp, only_if_no_revision: true, document: proposal.changes } }]);
  assert.equal(report.results[0].status, 'proposed');
  assert.equal(report.results[0].revision_id, REV);
});

test('concurrent revision/publication conflict stops later writes and reports prior private drafts', async () => {
  const otherId = '33333333-3333-4333-8333-333333333333';
  const input = { ...batch, proposals: [proposal, { ...proposal, code: 'studio' }, { ...proposal, code: 'chalet' }] };
  const state = { concepts: [concept, { ...concept, concept_id: otherId, code: 'studio' },
    { ...concept, concept_id: '44444444-4444-4444-8444-444444444444', code: 'chalet' }] };
  let calls = 0;
  const report = await proposeContentBatch(input, state, { apply: true, rpc: async () => {
    calls += 1;
    if (calls === 2) { const error = new Error('Sensitive upstream text'); error.code = 'PT409'; throw error; }
    return { revision_id: REV, version: 1 };
  } });
  assert.deepEqual(report.results.map((item) => item.status), ['proposed', 'conflict', 'not_attempted']);
  assert.equal(calls, 2);
  assert.ok(!JSON.stringify(report).includes('Sensitive'));
});

test('qualified identity distinguishes homonyms in separate schemes', async () => {
  const input = { ...batch, proposals: [{ ...proposal, domain: 'classification_value', code: 'gold', context_key: 'scheme-b' }] };
  const state = { concepts: [{ ...concept, domain: 'classification_value', code: 'gold', context_key: 'scheme-a' },
    { ...concept, concept_id: REV, domain: 'classification_value', code: 'gold', context_key: 'scheme-b' }] };
  const report = await proposeContentBatch(input, state);
  assert.equal(report.results[0].concept_id, REV);
});

test('already installed changes are unchanged without rewriting a draft', async () => {
  const report = await proposeContentBatch(batch, { concepts: [{ ...concept, ...proposal.changes }] },
    { apply: true, rpc: () => assert.fail('Unexpected write') });
  assert.equal(report.results[0].status, 'unchanged');
});

test('malformed, duplicate and unbased updates are rejected before reading a backend', () => {
  for (const input of [{ ...batch, format_version: 2 }, { ...batch, proposals: [proposal, proposal] },
    { ...batch, proposals: [{ ...proposal, base: {} }] },
    { ...batch, proposals: [{ ...proposal, changes: { code: 'changed' }, base: { code: 'appartement' } }] }]) {
    assert.throws(() => validateBatch(input));
  }
});

test('workspace pagination retains entries beyond 200 and confines reads to requested domains', async () => {
  const calls = [];
  const state = await loadWorkspace(batch, async (action, payload) => {
    calls.push({ action, payload });
    return { capabilities: { content_proposal_preconditions: 1, read_only_workspace: 1 },
      concepts: payload.offset === 0 ? Array.from({ length: 200 }, (_, index) => ({ concept_id: index })) : [concept] };
  });
  assert.equal(state.concepts.length, 201);
  assert.deepEqual(calls.map((call) => call.payload), [
    { domain: 'taxonomy_hlo', page_size: 200, offset: 0, read_only: true },
    { domain: 'taxonomy_hlo', page_size: 200, offset: 200, read_only: true },
  ]);
  assert.ok(calls.every((call) => call.action === 'workspace'));
});

test('older databases that ignore proposal guards cannot be used by the tool', async () => {
  await assert.rejects(() => loadWorkspace(batch, async () => ({ concepts: [concept] })), /protected content proposals/);
});

test('authenticated transport uses the api profile and never forwards SQL error details', async () => {
  let call;
  const rpc = createRpc({ url: 'https://example.supabase.co', anonKey: 'existing-public-key', accessToken: 'existing-user-session',
    fetchImpl: async (...args) => { call = args; return { ok: false, status: 409,
      json: async () => ({ code: 'PT409', message: 'Sensitive source content' }) }; } });
  await assert.rejects(() => rpc('save_draft', { expected_version: 0 }), (error) => error.code === 'PT409'
    && !error.message.includes('Sensitive'));
  assert.equal(call[0], 'https://example.supabase.co/rest/v1/rpc/thesaurus_admin');
  assert.equal(call[1].headers['Content-Profile'], 'api');
  assert.equal(call[1].headers.Authorization, 'Bearer existing-user-session');
  assert.equal(call[1].redirect, 'error');
  assert.throws(() => createRpc({ url: 'http://external.invalid', anonKey: 'x', accessToken: 'y' }));
});
