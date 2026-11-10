/** @jest-environment node */
jest.mock('server-only', () => ({}));
jest.mock('./partner-auth', () => ({ admitPartner: jest.fn(), logPartnerCall: jest.fn() }));
jest.mock('./public-api', () => ({
  callPublicRpc: jest.fn(), publicHeaders: () => ({}), PUBLIC_API_CONTRACT_VERSION: '1.0.0',
}));

import { NextRequest } from 'next/server';
import { admitPartner } from './partner-auth';
import { callPublicRpc } from './public-api';
import { handleThesaurusRequest, publicThesaurusConcept, thesaurusJsonLd, type ThesaurusAction } from './thesaurus-api';

const admit = admitPartner as jest.Mock;
const rpc = callPublicRpc as jest.Mock;
const ACTION_ID = '11111111-1111-4111-8111-111111111111';
const GROUP_ID = '22222222-2222-4222-8222-222222222222';
const ACTION_CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const GROUP_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';

const action = {
  concept_id: ACTION_ID, uri: `https://example.test/concept/${ACTION_ID}`, domain: 'sustainability_action',
  code: 'reduce-waste', context_key: 'action-category', name: 'Réduire les déchets',
  preferred_labels: { fr: 'Réduire les déchets', en: 'Reduce waste' }, definitions: { fr: 'Définition.' },
  broader: [ACTION_CATEGORY_ID], narrower: [], related: [], replaced_by: [], relations: [], mappings: [],
  labels: [], notes: [], lifecycle: 'active', assignable: true, valid_from: null, valid_to: null,
  member_of: [GROUP_ID], source_fields: { private_source_id: 'secret' }, private_metadata: 'must not leak',
};
const group = {
  concept_id: GROUP_ID, uri: `https://example.test/concept/${GROUP_ID}`, domain: 'sustainability_group',
  code: 'waste', context_key: GROUP_CATEGORY_ID, name: 'Déchets',
  preferred_labels: { fr: 'Déchets', en: 'Waste' }, definitions: { fr: 'Groupe de déchets.' },
  broader: [GROUP_CATEGORY_ID], narrower: [], related: [], replaced_by: [], relations: [], mappings: [],
  labels: [], notes: [], lifecycle: 'active', assignable: true, valid_from: null, valid_to: null,
  members: [ACTION_ID], private_metadata: 'must not leak',
};

const paths: Record<ThesaurusAction, string> = {
  manifest: '/api/public/thesaurus', release: '/api/public/thesaurus/releases/5',
  concepts: '/api/public/thesaurus/releases/5/concepts', concept: `/api/public/thesaurus/releases/5/concepts/${ACTION_ID}`,
  resolve: `/api/public/thesaurus/concepts/${ACTION_ID}`, changes: '/api/public/thesaurus/releases/5/changes',
  export: '/api/public/thesaurus/releases/5/export',
};
const request = (path: string, headers: Record<string, string> = {}) => new NextRequest(`http://localhost${path}`, {
  headers: { authorization: `Bearer bk_live_${'a'.repeat(48)}`, ...headers },
});
const response = (data: unknown) => ({ ok: true, status: 200, body: { meta: {
  release_id: 5, previous_release_id: 4, as_of: '2026-11-10T00:00:00Z', total: 2, next_after: null,
}, data } });

beforeEach(() => {
  admit.mockReset().mockResolvedValue({ partner: { keyId: 'partner' }, rate: { allowed: true, limit: 100, remaining: 99, retryAfter: 0 } });
  rpc.mockReset().mockResolvedValue(response([action, group]));
});

function target(actionName: ThesaurusAction) {
  return { action: actionName, ...(actionName === 'release' || actionName === 'concepts' || actionName === 'concept'
    || actionName === 'changes' || actionName === 'export' ? { releaseId: '5' } : {}),
  ...(actionName === 'concept' || actionName === 'resolve' ? { conceptId: ACTION_ID } : {}) };
}

test('explicit public projection validates and preserves frozen membership arrays while retaining category hierarchy', () => {
  const projectedAction = publicThesaurusConcept(action);
  const projectedGroup = publicThesaurusConcept(group);
  expect(projectedAction.member_of).toEqual([GROUP_ID]);
  expect(projectedAction.broader).toEqual([ACTION_CATEGORY_ID]);
  expect(projectedGroup.members).toEqual([ACTION_ID]);
  expect(projectedGroup.broader).toEqual([GROUP_CATEGORY_ID]);
  expect(projectedAction).not.toHaveProperty('source_fields');
  expect(projectedAction).not.toHaveProperty('private_metadata');
  expect(projectedGroup).not.toHaveProperty('private_metadata');
  expect(publicThesaurusConcept({ ...action, member_of: undefined })).not.toHaveProperty('member_of');
  expect(publicThesaurusConcept({ ...group, members: undefined })).not.toHaveProperty('members');
});

test.each([
  ['member_of', ['not-a-uuid']], ['member_of', [GROUP_ID, GROUP_ID]], ['member_of', null],
  ['member_of', ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA']],
  ['members', ['not-a-uuid']], ['members', [ACTION_ID, ACTION_ID]], ['members', null],
] as const)('rejects malformed snapshot membership field %s', (field, value) => {
  const source = field === 'member_of' ? { ...action, [field]: value } : { ...group, [field]: value };
  expect(() => publicThesaurusConcept(source)).toThrow('invalid_snapshot');
});

test.each(['concepts', 'concept', 'resolve', 'changes', 'export'] as const)(
  'serves frozen membership fields through the %s handler with no source lookup', async (actionName) => {
    const data = actionName === 'concepts' || actionName === 'export' ? [action, group]
      : actionName === 'changes' ? [{ concept_id: ACTION_ID, change_type: 'modified', before: action, after: group }]
        : action;
    rpc.mockResolvedValue(response(data));
    const url = paths[actionName] + (actionName === 'export' ? '?format=json' : '');
    const result = await handleThesaurusRequest(request(url), target(actionName));
    expect(result.status).toBe(200);
    const body = await result.json();
    const concepts = actionName === 'concepts' || actionName === 'export' ? body.data
      : actionName === 'changes' ? [body.data[0].before, body.data[0].after] : [body.data];
    if (actionName === 'concept' || actionName === 'resolve') expect(concepts[0]).toMatchObject({ member_of: [GROUP_ID] });
    else expect(concepts.map((item: any) => [item.member_of, item.members])).toEqual([[ [GROUP_ID], undefined ], [undefined, [ACTION_ID]]]);
    expect(JSON.stringify(body)).not.toContain('private_source_id');
    expect(JSON.stringify(body)).not.toContain('must not leak');
    expect(rpc).toHaveBeenCalledTimes(1);
  });

test.each([
  ['concepts', { ...action, member_of: [GROUP_ID, GROUP_ID] }],
  ['concept', { ...action, member_of: ['bad-id'] }],
  ['resolve', { ...action, members: ['bad-id'] }],
  ['changes', { ...action, member_of: null }],
  ['export', { ...group, members: ['not-a-uuid'] }],
] as const)('returns invalid_snapshot for malformed membership from %s', async (actionName, row) => {
  const data = actionName === 'changes' ? [{ concept_id: ACTION_ID, change_type: 'modified', before: row, after: null }]
    : actionName === 'concepts' || actionName === 'export' ? [row] : row;
  rpc.mockResolvedValue(response(data));
  const result = await handleThesaurusRequest(request(paths[actionName]), target(actionName));
  expect(result.status).toBe(502);
  expect(await result.json()).toEqual({ error: 'invalid_snapshot' });
});

test('JSON-LD emits Bertel membership predicates as target URIs and preserves distinct category broader edges', () => {
  const doc = thesaurusJsonLd([action, group, { ...action, concept_id: ACTION_CATEGORY_ID,
    uri: `https://example.test/concept/${ACTION_CATEGORY_ID}`, domain: 'sustainability_category', member_of: undefined }]);
  const graph = doc['@graph'] as Array<Record<string, any>>;
  const actionNode = graph.find((node) => node.concept_id === ACTION_ID)!;
  const groupNode = graph.find((node) => node.concept_id === GROUP_ID)!;
  expect(actionNode['bertel:memberOf']).toEqual([{ '@id': group.uri }]);
  expect(actionNode['skos:broader']).toEqual([{ '@id': `https://example.test/concept/${ACTION_CATEGORY_ID}` }]);
  expect(groupNode['bertel:member']).toEqual([{ '@id': action.uri }]);
  expect(groupNode['skos:broader']).toEqual([{ '@id': `https://example.test/concept/${GROUP_CATEGORY_ID}` }]);
  expect(actionNode).not.toHaveProperty('skos:related');
});

test('filtered JSON-LD constructs a frozen membership target URI without fetching an excluded endpoint', async () => {
  rpc.mockResolvedValue(response([action]));
  const result = await handleThesaurusRequest(request(paths.export + '?format=jsonld&domains=sustainability_action'), target('export'));
  expect(result.status).toBe(200);
  const document = await result.json();
  expect(document['@graph']).toHaveLength(1);
  expect(document['@graph'][0]['bertel:memberOf']).toEqual([{ '@id': group.uri }]);
  expect(rpc).toHaveBeenCalledTimes(1);
  expect(rpc).toHaveBeenCalledWith('thesaurus_public', expect.objectContaining({
    p_action: 'export', p_params: expect.objectContaining({ domains: ['sustainability_action'] }),
  }));
});

test('membership changes the representation ETag and the exact representation returns 304', async () => {
  rpc.mockResolvedValue(response([action]));
  const first = await handleThesaurusRequest(request(paths.export), target('export'));
  rpc.mockResolvedValue(response([{ ...action, member_of: [] }]));
  const changed = await handleThesaurusRequest(request(paths.export), target('export'));
  expect(changed.headers.get('etag')).not.toBe(first.headers.get('etag'));
  const cached = await handleThesaurusRequest(request(paths.export, { 'if-none-match': changed.headers.get('etag')! }), target('export'));
  expect(cached.status).toBe(304);
  expect(await cached.text()).toBe('');
});
