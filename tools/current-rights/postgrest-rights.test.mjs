import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import test from 'node:test';
import { loadDisposable } from './disposable.mjs';

const local = loadDisposable();
const browserWitness = process.env.CURRENT_RIGHTS_EDITOR_BROWSER === 'true';
const ids = {
  writer: '00000000-0000-4000-a000-00000000ae11', other: '00000000-0000-4000-a000-00000000ae12',
  portal: '00000000-0000-4000-a000-00000000ae13', foreignPortal: '00000000-0000-4000-a000-00000000ae14',
  admin: '00000000-0000-4000-a000-00000000ae15', tester: '00000000-0000-4000-a000-00000000ae16',
};
const emails = { writer: 'current-rights-writer', other: 'current-rights-email', portal: 'current-rights-portal',
  foreignPortal: 'current-rights-other-portal', admin: 'current-rights-admin', tester: 'current-rights-test-realm' };
const A = 'HOTRUN999999AR01', B = 'HOTRUN999999AR02', PUBLIC = 'HOTRUN999999AR03', TEST = 'HOTRUN999999AR05';
const INITIAL_PUBLISHED = 'HOTRUN999999AR06', INITIAL_DRAFT = 'HOTRUN999999AR07';
const DOC = '00000000-0000-4000-a000-00000000ae41', PHOTO = '00000000-0000-4000-a000-00000000ae42';
const originalTokens = new Map();
const sessions = new Map();
const headers = (key) => {
  const value = sessions.get(key);
  assert.ok(value && value.authorization === originalTokens.get(key), 'the byte-identical original GoTrue JWT must be reused');
  return value;
};
const rpc = (who, name, body = {}) => local.request(`/rest/v1/rpc/${name}`, who, body, 'POST', {
  'content-profile': 'api', 'accept-profile': 'api',
});
async function json(response, label) {
  assert.ok(response.ok, `${label} failed (${response.status})`);
  if (response.status === 204) return null;
  return response.json();
}
async function signIn(id, { email, password }) {
  const signedIn = await json(await local.request('/auth/v1/token?grant_type=password', local.anonymous,
    { email, password }), 'real synthetic password login');
  assert.ok(typeof signedIn.access_token === 'string', 'GoTrue must issue a real access JWT');
  const auth = Object.freeze({ ...local.anonymous, authorization: `Bearer ${signedIn.access_token}` });
  const verified = await json(await local.request('/auth/v1/user', auth, undefined, 'GET'), 'independent Auth verification');
  assert.ok(verified.id === id, 'Auth must independently verify the same synthetic UID');
  return auth;
}
async function rows(who, object) {
  return json(await local.request(`/rest/v1/object?select=id,name,status,is_test&id=eq.${object}`, who, undefined, 'GET'), 'object RLS read');
}
async function canWrite(key, object) {
  return json(await rpc(headers(key), 'user_can_write_object_canonical', { p_object_id: object }), 'canonical authority');
}
async function denied(response, label) {
  assert.ok(response.status === 403, `${label} must refuse the still-authenticated JWT (${response.status})`);
  assert.ok((await response.json()).code === '42501', `${label} must be a current-rights refusal`);
}
function commit(sql, stage) {
  return local.sql(`BEGIN; SELECT set_config('request.jwt.claims','{"role":"service_role"}',true); ${sql}; COMMIT;`, stage);
}
async function testInitialPublication() {
  const writerRole = (code) => commit(
    `UPDATE public.user_org_business_role
       SET role_id=(SELECT id FROM public.ref_org_business_role WHERE code='${code}')
     WHERE membership_id='00000000-0000-4000-a000-00000000ab11' AND is_active`,
    `committed writer role: ${code}`,
  );
  const permission = () => rpc(headers('writer'), 'user_has_permission', { p_permission_code: 'publish_object' });
  // A separate GET observes the publisher link created by the AFTER INSERT trigger.
  const create = (body) => local.request('/rest/v1/object', headers('writer'), body, 'POST',
    { prefer: 'return=minimal' });
  async function verifyCreated(id, status) {
    const inserted = await rows(headers('writer'), id);
    assert.deepEqual(inserted.map((row) => ({ id: row.id, status: row.status })), [{ id, status }]);
  }
  const body = {
    id: INITIAL_DRAFT, object_type: 'HOT', name: 'Synthetic initial publication', created_by: ids.writer, status: 'published',
  };

  assert.equal(await json(await permission(), 'editor publication permission'), true);
  const editor = await create({ ...body, id: INITIAL_PUBLISHED });
  assert.equal(editor.status, 201, 'current editor/publisher must create an initially published object');
  await verifyCreated(INITIAL_PUBLISHED, 'published');

  writerRole('contributor');
  try {
    assert.equal(await json(await rpc(headers('writer'), 'user_can_create_object'), 'contributor creation permission'), true);
    assert.equal(await json(await permission(), 'contributor publication permission'), false);
    const refused = await create(body);
    assert.equal(refused.status, 403, 'initial publication must refuse the same still-authenticated JWT');
    const { code, message } = await refused.json();
    assert.equal(code, '42501');
    assert.match(message, /^Initial publication requires the publish_object permission and a publisher ORG/);
    const noEffects = local.sql(`SELECT NOT EXISTS (SELECT 1 FROM public.object WHERE id='${INITIAL_DRAFT}')
      AND NOT EXISTS (SELECT 1 FROM public.object_org_link WHERE object_id='${INITIAL_DRAFT}')`,
    'refused initial publication left neither object nor publisher link');
    assert.equal(noEffects, 't');
    const control = await create({ ...body, status: 'draft' });
    assert.equal(control.status, 201, 'the same contributor payload must create a draft');
    await verifyCreated(INITIAL_DRAFT, 'draft');
    const publisherLinks = local.sql(`SELECT count(DISTINCT l.object_id)
      FROM public.object_org_link l JOIN public.ref_org_role r ON r.id=l.role_id
      WHERE l.org_object_id='ORGRUN999999AR01' AND r.code='publisher'
        AND l.object_id IN ('${INITIAL_PUBLISHED}','${INITIAL_DRAFT}')`,
      'publisher links after each authorized insert');
    assert.equal(publisherLinks, '2');
  } finally {
    writerRole('editor');
  }
}

async function testOrgEnrichment() {
  const orgA = 'ORGRUN999999AR01';
  const orgB = 'ORGRUN999999AR02';
  const permission = 'edit_org_enrichment';
  const write = (description) => rpc(headers('other'), 'rpc_write_org_description', {
    p_object_id: PUBLIC, p_payload: { description },
  });
  const permissions = () => rpc(headers('other'), 'get_object_workspace_permissions', { p_object_id: PUBLIC });
  const descriptions = () => JSON.parse(local.sql(
    `SELECT jsonb_object_agg(COALESCE(org_object_id,'canonical'), to_jsonb(d))
      FROM public.object_description d WHERE object_id='${PUBLIC}'`,
    'disposable canonical and organization descriptions',
  ));
  async function assertWorkspace(expected) {
    const actual = await json(await permissions(), 'current workspace permissions for enrichment');
    assert.equal(actual.enrichment, expected);
    assert.equal(actual.canonical, false, 'the target remains outside canonical scope');
  }

  // The existing fixture owns both ORGs, the user and the published object; its
  // cleanup removes the link, descriptions and ORG permission rows by those IDs.
  const [published] = await rows(headers('other'), PUBLIC);
  assert.equal(published?.status, 'published');
  assert.equal(published.is_test, false, 'the object must belong to the production-shaped synthetic corpus');
  assert.equal(await json(await rpc(headers('other'), 'current_user_test_realm'), 'same realm'), false);
  assert.equal(await canWrite('other', PUBLIC), false, 'ORG B is not the publisher');
  commit(`INSERT INTO public.object_description(object_id,org_object_id,visibility,description) VALUES
      ('${PUBLIC}',NULL,'public','Synthetic canonical description'),
      ('${PUBLIC}','${orgA}','public','Synthetic publisher overlay'),
      ('${PUBLIC}','${orgB}','public','Synthetic contributor overlay');
    INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
      SELECT '${PUBLIC}','${orgB}',id,false FROM public.ref_org_role WHERE code='contributor'`,
  'seed nonempty canonical and ORG controls and an explicit contributor link');
  const before = descriptions();
  assert.deepEqual(Object.keys(before).sort(), [orgA, orgB, 'canonical'].sort());

  assert.equal(await json(await rpc(headers('other'), 'user_has_permission', { p_permission_code: permission }),
    'the fixture business role has the seeded enrichment permission'), true);
  await assertWorkspace(true);
  const updated = await json(await write('Synthetic permitted contributor edit'), 'independent contributor enrichment');
  const saved = descriptions();
  assert.deepEqual(updated, { id: before[orgB].id, org_object_id: orgB });
  assert.deepEqual(Object.keys(saved).sort(), Object.keys(before).sort());
  assert.equal(saved[orgB].description, 'Synthetic permitted contributor edit');
  assert.deepEqual(saved.canonical, before.canonical);
  assert.deepEqual(saved[orgA], before[orgA]);

  commit(`UPDATE public.org_role_permission SET is_active=false
    WHERE org_object_id='${orgB}' AND role_id=(SELECT id FROM public.ref_org_business_role WHERE code='editor')
      AND permission_id=(SELECT id FROM public.ref_permission WHERE code='${permission}')`,
  'revoke the ORG business-role permission while retaining the contributor link');
  await assertWorkspace(false);
  await denied(await write('Revoked grant must not change its overlay'), 'enrichment after committed revocation');
  assert.deepEqual(descriptions(), saved, 'the revoked grant changed no description');
}

const proposal = [{ target_table: 'object_description', target_pk: null, action: 'update', payload: { chapo: 'Synthetic HTTP proposal' },
  metadata: { rpc: null, section: 'contacts', manual_apply: true, field: 'Contacts', before: 'a', after: 'b' } }];

const testName = browserWitness
  ? 'real editor retains newer inputs across a delayed canonical PATCH, restore and workspace read'
  : 'real GoTrue JWTs enforce current multi-ORG/realm rights after committed demotion, departure and portal revocation';
test(testName, { timeout: browserWitness ? 300000 : 90000 }, async (t) => {
  const createdIds = [];
  let fixtureCreated = false;
  let writerCredentials;
  let otherCredentials;
  let testerCredentials;
  try {
    const publicationFixtures = local.sql(`SELECT count(*) FROM public.object WHERE id IN ('${INITIAL_PUBLISHED}','${INITIAL_DRAFT}')`,
      'initial publication fixtures are absent');
    assert.equal(publicationFixtures, '0', 'the publication fixture IDs must be unused before setup and cleanup');
    if (browserWitness) {
      const clean = local.sql(`SELECT NOT EXISTS (SELECT 1 FROM public.object WHERE id='${A}')
        AND NOT EXISTS (SELECT 1 FROM public.object_version WHERE object_id='${A}')`, 'check clean editor fixture');
      assert.equal(clean, 't', 'the editor fixture and its history must be absent before browser setup');
    }
    assert.ok(Object.keys(ids).length === 6 && new Set(Object.values(ids)).size === 6, 'the fixture must own exactly six distinct synthetic identities');
    for (const [key, id] of Object.entries(ids)) {
      const email = `${emails[key]}@example.invalid`;
      const password = `Disposable!7-${randomUUID()}`;
      const appMetadata = key === 'writer' ? { role: 'super_admin' }
        : key === 'portal' ? { role: 'actor', actor_id: '00000000-0000-4000-a000-00000000aa01' }
          : key === 'tester' ? { is_test: true } : {};
      const created = await json(await local.request('/auth/v1/admin/users', local.service,
        { id, email, password, email_confirm: true, app_metadata: appMetadata }), 'confirmed synthetic Auth creation');
      if (typeof created.id === 'string' && /^[0-9a-f-]{36}$/i.test(created.id)) createdIds.push(created.id);
      assert.ok(created.id === id && created.email === email && created.email_confirmed_at, 'GoTrue must create the exact confirmed synthetic identity');
      if (browserWitness && key === 'writer') writerCredentials = { email, password };
      if (browserWitness && key === 'other') otherCredentials = { email, password };
      if (browserWitness && key === 'tester') testerCredentials = { email, password };
      if (key === 'admin') continue; // Only a fixture FK; never used to bypass HTTP assertions.
      const auth = await signIn(id, { email, password });
      sessions.set(key, auth); originalTokens.set(key, auth.authorization);
    }
    assert.ok(createdIds.length === 6 && sessions.size === 5 && originalTokens.size === 5
      && new Set(originalTokens.values()).size === 5 && !sessions.has('admin'),
    'exactly six identities and five distinct real JWTs are required; the fixture-only admin never authenticates');
    local.sqlFile(resolve('Base de donnée DLL et API/tests/fixtures/object_current_rights_http.sql'), 'setup');
    fixtureCreated = true;
    if (browserWitness) {
      assert.equal(await canWrite('other', A), false, 'the second account starts outside the publisher organization');
      const { testTaskMultipartHttp } = await import('../../bertel-tourism-ui/tests/current-rights/task-multipart-http.mjs');
      await testTaskMultipartHttp({ local, commit, objectId: A, writerId: ids.writer,
        writerAuthorization: headers('writer').authorization, foreignAuthorization: headers('other').authorization });
      t.diagnostic('Disposable Next HTTP upload bounds, cross-route leases and task document writes passed.');
      // Move the existing fixture membership only in this disposable browser run.
      // Its editor role and cleanup both follow the same membership ID.
      commit(`DO $fixture$ BEGIN
        UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR01'
        WHERE id='00000000-0000-4000-a000-00000000ab12' AND user_id='${ids.other}'
          AND org_object_id='ORGRUN999999AR02' AND is_active;
        IF NOT FOUND THEN RAISE EXCEPTION 'missing second browser membership'; END IF;
      END; $fixture$`, 'give both browser accounts current rights on the same synthetic object');
      assert.equal(await canWrite('writer', A), true);
      assert.equal(await canWrite('other', A), true);
      const { testEditorRaces } = await import('../../bertel-tourism-ui/tests/current-rights/editor-races.mjs');
      await testEditorRaces({ local, objectId: A, writerId: ids.writer, ...writerCredentials,
        realmAccount: { userId: ids.tester, ...testerCredentials },
        secondAccount: { id: ids.other, ...otherCredentials } });
      t.diagnostic('Authenticated Chromium and PostgREST publication, restore, legal, account draft isolation and same-JWT Explorer realm switch passed.');
      commit(`DO $fixture$ BEGIN
        UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR02'
        WHERE id='00000000-0000-4000-a000-00000000ab12' AND user_id='${ids.other}'
          AND org_object_id='ORGRUN999999AR01' AND is_active;
        IF NOT FOUND THEN RAISE EXCEPTION 'missing second browser membership'; END IF;
      END; $fixture$`, 'restore the other organization before the document witness');
      // The browser signs these users out globally. Start verified GoTrue sessions
      // after that scenario, then keep these exact JWTs across the document revocation.
      const [writer, other] = await Promise.all([
        signIn(ids.writer, writerCredentials), signIn(ids.other, otherCredentials),
      ]);
      for (const [objectId, expected] of [[A, false], [B, true]]) {
        assert.equal(await json(await rpc(other, 'user_can_write_object_canonical', { p_object_id: objectId }),
          'fresh foreign canonical authority'), expected);
      }
      const { testDocumentLinks } = await import('../../bertel-tourism-ui/tests/current-rights/document-links.mjs');
      await testDocumentLinks({ local, commit, objectId: A, documentId: DOC, writerId: ids.writer,
        writerAuthorization: writer.authorization, foreignAuthorization: other.authorization });
      t.diagnostic('Disposable document route verified canonical and legal-only signed bytes, foreign refusal and same-JWT revocation.');
      return;
    }
    const versionA = Number(local.sql(`SELECT min(version_number) FROM public.object_version WHERE object_id='${A}'`, 'private history witness'));
    const versionPublic = Number(local.sql(`SELECT min(version_number) FROM public.object_version WHERE object_id='${PUBLIC}'`, 'public history witness'));
    assert.ok(Number.isInteger(versionA) && versionA > 0 && Number.isInteger(versionPublic) && versionPublic > 0, 'history positives must be nonempty');

    // Independent positive scopes; creator provenance and e-mail links are not grants.
    assert.ok((await rows(headers('writer'), A)).length === 1 && (await rows(headers('writer'), B)).length === 0);
    assert.ok((await rows(headers('other'), B)).length === 1 && (await rows(headers('other'), A)).length === 0);
    assert.ok(await canWrite('writer', A) === true && await canWrite('writer', B) === false);
    assert.ok(await canWrite('other', B) === true && await canWrite('other', A) === false);
    assert.ok(await json(await rpc(headers('writer'), 'is_platform_superuser'), 'current platform authority') === false,
      'a signed but stale app_metadata super_admin value must not become current platform authority');
    let changed = await json(await local.request(`/rest/v1/object?id=eq.${A}`, headers('writer'),
      { name: 'Real JWT current writer positive' }, 'PATCH', { prefer: 'return=representation' }), 'positive canonical DML');
    assert.ok(changed.length === 1 && changed[0].name === 'Real JWT current writer positive');
    const changedB = await json(await local.request(`/rest/v1/object?id=eq.${B}`, headers('other'),
      { name: 'Real JWT ORG B positive' }, 'PATCH', { prefer: 'return=representation' }), 'independent ORG B DML positive');
    assert.ok(changedB.length === 1 && changedB[0].name === 'Real JWT ORG B positive');
    assert.ok((await json(await rpc(headers('writer'), 'get_object_versions', { p_object_id: A, p_limit: 50, p_offset: 0 }), 'private history')).length > 0);
    await json(await rpc(headers('writer'), 'rpc_restore_object_version', { p_object_id: A, p_version_number: versionA }), 'authorized restore');
    let documents = await json(await rpc(headers('writer'), 'get_active_object_documents', { p_object_id: A }), 'private legal positive');
    assert.ok(documents.authorized === true && documents.documents.length === 1, 'document positive must not be empty');
    const file = await json(await rpc(headers('writer'), 'get_object_document_file', { p_object_id: A, p_document_id: DOC }), 'exact private pair positive');
    assert.ok(file.authorized === true && file.file?.path === 'synthetic-http.pdf');
    const foreignFile = await json(await rpc(headers('other'), 'get_object_document_file', { p_object_id: A, p_document_id: DOC }), 'foreign private pair');
    assert.ok(foreignFile.authorized === false && foreignFile.file === null);

    await testOrgEnrichment();
    t.diagnostic('Same-realm ORG enrichment and committed permission revocation passed with the same JWT.');
    await testInitialPublication();

    commit("UPDATE public.user_org_business_role SET is_active=false WHERE membership_id='00000000-0000-4000-a000-00000000ab11'", 'committed demotion');
    assert.ok(await canWrite('writer', A) === false && (await rows(headers('writer'), A)).length === 1);
    const beforeRefusals = local.sql(`SELECT name FROM public.object WHERE id='${A}'`, 'state before denied effects');
    changed = await json(await local.request(`/rest/v1/object?id=eq.${A}`, headers('writer'),
      { name: 'Forbidden real JWT demotion edit' }, 'PATCH', { prefer: 'return=representation' }), 'RLS denied DML');
    assert.ok(changed.length === 0, 'RLS filters a denied UPDATE to zero rows');
    await denied(await rpc(headers('writer'), 'rpc_restore_object_version', { p_object_id: A, p_version_number: versionA }), 'restore after demotion');
    documents = await json(await rpc(headers('writer'), 'get_active_object_documents', { p_object_id: A }), 'documents after demotion');
    assert.ok(documents.authorized === false && documents.documents.length === 0);
    const demotedFile = await json(await rpc(headers('writer'), 'get_object_document_file', { p_object_id: A, p_document_id: DOC }), 'private locator after demotion');
    assert.ok(demotedFile.authorized === false && demotedFile.file === null);
    assert.ok(local.sql(`SELECT name FROM public.object WHERE id='${A}'`, 'unchanged refused state') === beforeRefusals);

    commit(`INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by) SELECT '${ids.writer}',id,true,'${ids.admin}'
      FROM public.ref_permission WHERE code='edit_canonical_when_publisher'`, 'committed individual exception');
    assert.ok(await canWrite('writer', A) === true, 'current individual exception remains a positive witness');
    const exceptionName = 'Real JWT individual exception positive';
    const exceptionChanged = await json(await local.request(`/rest/v1/object?id=eq.${A}`, headers('writer'),
      { name: exceptionName }, 'PATCH', { prefer: 'return=representation' }), 'individual exception real DML positive');
    assert.ok(exceptionChanged.length === 1 && exceptionChanged[0].name === exceptionName);
    commit(`UPDATE public.user_permission SET is_active=false WHERE user_id='${ids.writer}'`, 'committed exception revocation');
    assert.ok(await canWrite('writer', A) === false);
    const revokedException = await json(await local.request(`/rest/v1/object?id=eq.${A}`, headers('writer'),
      { name: 'Forbidden revoked exception edit' }, 'PATCH', { prefer: 'return=representation' }), 'DML after individual revocation');
    assert.ok(revokedException.length === 0 && local.sql(`SELECT name FROM public.object WHERE id='${A}'`, 'exception state after refusal') === exceptionName);
    commit(`UPDATE public.user_permission SET is_active=true WHERE user_id='${ids.writer}';
      UPDATE public.user_org_membership SET is_active=false WHERE id='00000000-0000-4000-a000-00000000ab11'`, 'committed departure');
    assert.ok((await rows(headers('writer'), A)).length === 0 && await canWrite('writer', A) === false,
      'a former creator with a still-active individual permission must not invent publisher scope');
    await denied(await rpc(headers('writer'), 'get_object_versions', { p_object_id: A, p_limit: 50, p_offset: 0 }), 'private history after departure');
    await denied(await rpc(headers('writer'), 'get_object_version_snapshot', { p_object_id: A, p_version_number: versionA }), 'private snapshot after departure');
    const departedFile = await json(await rpc(headers('writer'), 'get_object_document_file', { p_object_id: A, p_document_id: DOC }), 'private locator after departure');
    assert.ok(departedFile.authorized === false && departedFile.file === null);
    await denied(await rpc(headers('writer'), 'rpc_restore_object_version', { p_object_id: PUBLIC, p_version_number: versionPublic }), 'published restore after departure');
    assert.ok((await rows(headers('writer'), PUBLIC)).length === 1 && (await rows(local.anonymous, PUBLIC)).length === 1);
    assert.ok((await json(await rpc(headers('writer'), 'get_object_versions', { p_object_id: PUBLIC, p_limit: 50, p_offset: 0 }), 'existing published history rule')).length > 0,
      'the existing published-readable history rule remains unchanged');

    // Move the only active ORG scope in one committed mutation, without JWT refresh.
    commit("UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR01' WHERE id='00000000-0000-4000-a000-00000000ab12'", 'committed ORG scope switch');
    assert.ok((await rows(headers('other'), B)).length === 0 && (await rows(headers('other'), A)).length === 1);
    assert.ok(await canWrite('other', B) === false && await canWrite('other', A) === true);
    const switchedDenied = await json(await local.request(`/rest/v1/object?id=eq.${B}`, headers('other'),
      { name: 'Forbidden former ORG edit' }, 'PATCH', { prefer: 'return=representation' }), 'old ORG DML after scope switch');
    assert.ok(switchedDenied.length === 0);

    assert.ok(await json(await rpc(headers('tester'), 'current_user_test_realm'), 'test realm positive') === true);
    assert.ok((await rows(headers('tester'), TEST)).length === 1 && (await rows(headers('tester'), PUBLIC)).length === 0);
    assert.ok((await rows(local.anonymous, TEST)).length === 0 && (await rows(headers('other'), TEST)).length === 0);
    assert.ok(await canWrite('tester', TEST) === true && await canWrite('tester', A) === false);
    const testChanged = await json(await local.request(`/rest/v1/object?id=eq.${TEST}`, headers('tester'),
      { name: 'Real JWT test realm positive' }, 'PATCH', { prefer: 'return=representation' }), 'test realm DML positive');
    assert.ok(testChanged.length === 1 && testChanged[0].is_test === true);
    const spoofedRealm = await local.request(`/rest/v1/object?id=eq.${TEST}`, headers('tester'),
      { name: 'Forbidden derived realm mutation', is_test: false }, 'PATCH', { prefer: 'return=minimal' });
    assert.equal(spoofedRealm.status, 403, 'an otherwise authorized test writer cannot set is_test');
    const realmError = await spoofedRealm.json();
    assert.equal(realmError.code, '42501');
    assert.equal(realmError.details, 'object_realm_is_derived');
    assert.deepEqual((await rows(headers('tester'), TEST)).map(({ name, is_test }) => ({ name, is_test })),
      [{ name: 'Real JWT test realm positive', is_test: true }], 'the refused PATCH preserves the name and derived realm');
    commit("UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR02' WHERE id='00000000-0000-4000-a000-00000000ab16'", 'committed realm scope switch');
    assert.ok(await json(await rpc(headers('tester'), 'current_user_test_realm'), 'current production realm') === false);
    assert.ok((await rows(headers('tester'), TEST)).length === 0 && (await rows(headers('tester'), PUBLIC)).length === 1);
    assert.ok((await rows(headers('tester'), B)).length === 1 && await canWrite('tester', B) === true && await canWrite('tester', TEST) === false);
    const realmDenied = await json(await local.request(`/rest/v1/object?id=eq.${TEST}`, headers('tester'),
      { name: 'Forbidden former realm edit' }, 'PATCH', { prefer: 'return=representation' }), 'old realm DML after scope switch');
    assert.ok(realmDenied.length === 0);

    assert.ok((await rows(headers('portal'), A)).length === 1 && (await rows(headers('portal'), B)).length === 0);
    assert.ok((await rows(headers('foreignPortal'), B)).length === 1 && (await rows(headers('foreignPortal'), A)).length === 0);
    assert.ok(await canWrite('portal', A) === false, 'portal identity never adds canonical write');
    const workspace = await json(await rpc(headers('portal'), 'get_my_portal_photo_workspace', { p_object_id: A }), 'nonempty portal workspace');
    assert.ok(workspace.published.length === 2, 'portal positive must contain real synthetic media rows');
    const preview = await json(await rpc(headers('portal'), 'portal_photo_preview', { p_document_id: PHOTO }), 'private portal locator positive');
    assert.ok(preview.bucket === 'actor-documents' && typeof preview.path === 'string');
    await json(await rpc(headers('portal'), 'submit_actor_fiche', { p_object_id: A, p_changes: proposal, p_note: 'Synthetic real-JWT request' }), 'portal proposal positive');
    const proposalHash = () => local.sql(`SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY id)::text) FROM public.pending_change p WHERE object_id='${A}'`, 'proposal integrity');
    const beforeProposal = proposalHash();
    assert.ok(beforeProposal.length === 32, 'positive proposal must exist');
    commit(`UPDATE public.actor_object_role SET valid_to=CURRENT_DATE-1 WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='${A}'`, 'committed portal scope revocation');
    for (const [name, body] of [
      ['get_my_portal_photo_workspace', { p_object_id: A }], ['portal_photo_preview', { p_document_id: PHOTO }],
      ['submit_actor_fiche', { p_object_id: A, p_changes: proposal, p_note: null }],
    ]) await denied(await rpc(headers('portal'), name, body), `revoked portal ${name}`);
    assert.ok((await rows(headers('portal'), A)).length === 0 && proposalHash() === beforeProposal);
    commit(`UPDATE public.actor_object_role SET valid_to=NULL WHERE actor_id='00000000-0000-4000-a000-00000000aa01' AND object_id='${A}';
      UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='${ids.portal}'`, 'committed actor-role demotion');
    assert.ok(await json(await rpc(headers('portal'), 'current_user_actor_id'), 'current actor after demotion') === null);
    await denied(await rpc(headers('portal'), 'portal_photo_preview', { p_document_id: PHOTO }), 'actor role after committed demotion');
    commit(`UPDATE public.app_user_profile SET role='actor',actor_id=NULL WHERE id='${ids.portal}'`, 'committed account binding removal');
    assert.ok(await json(await rpc(headers('portal'), 'current_user_actor_id'), 'current actor after unlink') === null);
    await denied(await rpc(headers('portal'), 'portal_photo_preview', { p_document_id: PHOTO }), 'private photo locator after actor unlink');
    await denied(await rpc(headers('portal'), 'get_my_portal_photo_workspace', { p_object_id: A }), 'workspace after actor unlink');
    await denied(await rpc(headers('portal'), 'submit_actor_fiche', { p_object_id: A, p_changes: proposal, p_note: null }), 'removed actor binding');
    assert.ok(proposalHash() === beforeProposal && local.sql(`SELECT name FROM public.object WHERE id='${A}'`, 'final refused canonical state') === exceptionName);
    for (const key of sessions.keys()) {
      const verifiedAgain = await json(await local.request('/auth/v1/user', headers(key), undefined, 'GET'), 'Auth remains valid after authorization revocation');
      assert.ok(verifiedAgain.id === ids[key], 'the reused JWT must still authenticate the same live synthetic user');
    }
    t.diagnostic('Six Auth identities/five verified JWTs, positive A/B/test scopes and byte-identical JWT revocations passed; no refresh, provider, e-mail or Storage content used.');
  } finally {
    let cleanupOk = true;
    if (fixtureCreated) {
      try { local.sqlFile(resolve('Base de donnée DLL et API/tests/fixtures/object_current_rights_http_cleanup.sql'), 'cleanup'); }
      catch { cleanupOk = false; }
    }
    for (const id of createdIds.reverse()) {
      try { if (!(await local.request(`/auth/v1/admin/users/${id}`, local.service, { should_soft_delete: false }, 'DELETE')).ok) cleanupOk = false; }
      catch { cleanupOk = false; }
    }
    assert.ok(cleanupOk, 'synthetic fixture cleanup failed; disposable stack destruction is mandatory');
  }
});
