import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { storageErrorIdentity } from '../../../tools/current-rights/storage-refusals.mjs';
import { startApp, stopApp, waitForApp } from './editor-races.mjs';

const bucket = 'actor-documents';
const pdf = Buffer.from('%PDF-1.4\n% synthetic GDPR cleanup witness\n%%EOF\n');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const callerFunctions = ['api.rpc_gdpr_start_erasure(uuid,text,text,text,text)', 'api.rpc_gdpr_find_start_request(uuid)'];
const serverFunctions = ['api.rpc_gdpr_get_cleanup_status(uuid)',
  'api.rpc_gdpr_claim_cleanup_task(uuid,uuid,uuid,text,jsonb,text)',
  'api.rpc_gdpr_ack_cleanup_attempt(uuid,uuid,uuid,boolean,boolean,text)',
  'api.rpc_gdpr_refuse_cleanup_task(uuid,uuid,text,jsonb,text)'];
const legacyFunctions = ['api.rpc_gdpr_erase_subject(text,text,text,text)', 'api.rpc_gdpr_ack_cleanup_task(uuid,uuid,boolean,text)'];
const signatures = [...callerFunctions, ...serverFunctions, ...legacyFunctions].map((s) => `'${s}'`).join(',');

function barrier() {
  let release;
  const promise = new Promise((resolve) => { release = resolve; });
  return { release, promise };
}

async function bounded(promise, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(label)), 35_000);
    })]);
  } finally { clearTimeout(timer); }
}

export async function testGdprCleanupHttp({ local, commit, writerId, writerAuthorization }) {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_GDPR_CLEANUP === 'true'
    && process.env.CURRENT_RIGHTS_DISPOSABLE === 'true'
    && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(local.origin)
    && writerId === '00000000-0000-4000-a000-00000000ae11', 'owned Linux GDPR fixture required');
  const subject = randomUUID(), otherActor = randomUUID(), task = randomUUID(), otherTask = randomUUID();
  const requestId = randomUUID(), documents = [randomUUID(), randomUUID(), randomUUID()];
  const keys = documents.map((id) => `tasks/${task}/${id}.pdf`);
  const removable = new Set(keys.slice(0, 2));
  const closed = () => local.sql(`SELECT bool_and(NOT has_function_privilege(r,s,'EXECUTE'))
    FROM unnest(ARRAY[${signatures}]) s CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r`, 'closed GDPR API surface');
  assert.equal(closed(), 't', 'fixture grants must start from the owner-only candidate');
  assert.equal(local.sql(`SELECT role FROM public.app_user_profile WHERE id='${writerId}'`, 'ordinary fixture role'), 'tourism_agent');
  const profile = await local.request(`/storage/v1/bucket/${bucket}`, local.service, undefined, 'GET');
  assert.ok(profile.ok && (await profile.json()).public === false, 'private real Storage fixture bucket required');

  const counters = { start: 0, lookup: 0, status: 0, claim: 0, ack: 0, lostStart: 0, lostStorage: 0, lostAck: 0,
    authDelete: 0, lostAuth: 0, emptyLegacyCleanup: 0 };
  const removes = new Map();
  const acceptedDelete = barrier(), releaseStorageResponse = barrier();
  const errors = [];
  let app, operationId, proxy, unknownKey, confirmedTask;
  const authSubject = randomUUID();
  let authRegistered = false, authPhase = false, authOperationId;
  let fixtureCreated = false;
  const uploaded = [];
  const state = () => JSON.parse(local.sql(`SELECT coalesce(json_agg(json_build_object(
    'id',id,'path',metadata->>'path','status',status,'attemptState',attempt_state)
    ORDER BY metadata->>'path'),'[]') FROM internal.gdpr_cleanup_task WHERE operation_id='${operationId}'`, 'durable cleanup state'));
  const post = async (body) => {
    const response = await fetch(app.origin + '/api/rgpd/erase', { method: 'POST', redirect: 'error',
      headers: { authorization: writerAuthorization, 'content-type': 'application/json' },
      body: JSON.stringify(body), signal: AbortSignal.timeout(45_000) });
    return { status: response.status, body: await response.json() };
  };
  try {
    commit(`INSERT INTO public.actor(id,display_name,is_test) VALUES
      ('${subject}','Synthetic GDPR subject',false),('${otherActor}','Synthetic retained actor',false);
      INSERT INTO public.crm_task(id,object_id,actor_id,title) VALUES
      ('${task}','HOTRUN999999AR01','${subject}','Synthetic GDPR task'),
      ('${otherTask}','HOTRUN999999AR02','${otherActor}','Synthetic retained task');
      INSERT INTO public.ref_document(id,url,storage_bucket,storage_path,access_scope) VALUES
      ${documents.map((id, i) => `('${id}','storage://${bucket}/${keys[i]}','${bucket}','${keys[i]}','crm_private')`).join(',')};
      INSERT INTO public.crm_task_document(task_id,document_id,title) VALUES
      ${documents.map((id) => `('${task}','${id}','Synthetic attachment')`).join(',')},
      ('${otherTask}','${documents[2]}','Synthetic shared attachment');
      UPDATE public.app_user_profile SET role='super_admin' WHERE id='${writerId}'`, 'install owned synthetic GDPR records');
    fixtureCreated = true;
    // Execute the reviewed installation act itself, never a fixture copy of its grants.
    local.sqlFile(resolve('supabase/releases/20261108_gdpr_cleanup/activate.sql'), 'activate the exact GDPR capability on the disposable stack');
    assert.equal(local.sql(`SELECT bool_and(NOT has_function_privilege(r,s,'EXECUTE'))
      FROM unnest(ARRAY[${legacyFunctions.map((s) => `'${s}'`).join(',')}]) s
      CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r`, 'legacy GDPR entry points stay closed'), 't');
    for (const key of keys) {
      const result = await local.request(`/storage/v1/object/${bucket}/${key}`, local.service, pdf, 'POST',
        { 'content-type': 'application/pdf', 'x-upsert': 'false' });
      assert.ok(result.ok, 'synthetic PDF upload must succeed');
      uploaded.push(key);
      const read = await local.request(`/storage/v1/object/authenticated/${bucket}/${key}`, local.service, undefined, 'GET');
      assert.ok(read.ok, 'each exact target must be readable before erasure');
      assert.equal(sha(Buffer.from(await read.arrayBuffer())), sha(pdf));
    }

    // This proxy never emulates a successful backend. It forwards to the owned
    // real API, waits for its response, then loses exactly the chosen ACKs.
    proxy = createServer(async (req, res) => {
      try {
        const url = new URL(req.url, local.origin);
        assert.ok(url.origin === local.origin && !url.username && !url.password && !url.hash);
        const rpc = url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.slice('/rest/v1/rpc/'.length) : null;
        const allowedRpc = new Set(['is_platform_superuser', 'rpc_gdpr_start_erasure', 'rpc_gdpr_find_start_request',
          'rpc_gdpr_get_cleanup_status', 'rpc_gdpr_claim_cleanup_task', 'rpc_gdpr_ack_cleanup_attempt', 'rpc_gdpr_refuse_cleanup_task']);
        const authTarget = authPhase && authRegistered && url.pathname === `/auth/v1/admin/users/${authSubject}`;
        const authProfile = authPhase && authRegistered && url.pathname === '/rest/v1/app_user_profile'
          && url.searchParams.size === 2 && url.searchParams.get('select') === 'role'
          && url.searchParams.get('id') === `eq.${authSubject}`;
        const emptyLegacy = authPhase && authRegistered && url.pathname === '/storage/v1/object/avatars';
        assert.ok((req.method === 'GET' && url.pathname === '/auth/v1/user')
          || (req.method === 'GET' && (authTarget || authProfile))
          || (req.method === 'POST' && allowedRpc.has(rpc))
          || (req.method === 'DELETE' && (url.pathname === `/storage/v1/object/${bucket}` || authTarget || emptyLegacy)), 'unexpected Next egress');
        const chunks = [];
        let size = 0;
        for await (const chunk of req) { size += chunk.length; assert.ok(size <= 16 * 1024); chunks.push(chunk); }
        const bytes = Buffer.concat(chunks);
        const body = bytes.length ? JSON.parse(bytes.toString('utf8')) : null;
        if (rpc === 'rpc_gdpr_start_erasure') counters.start++;
        if (rpc === 'rpc_gdpr_start_erasure' && authPhase) {
          assert.equal(counters.start, 2, 'the Auth case admits only its single new START');
          assert.equal(body?.p_subject_kind, 'user');
          assert.equal(body?.p_subject_id, authSubject);
          assert.equal(body?.p_mode, 'delete');
        }
        if (rpc === 'rpc_gdpr_find_start_request') counters.lookup++;
        if (rpc === 'rpc_gdpr_get_cleanup_status') counters.status++;
        if (rpc === 'rpc_gdpr_claim_cleanup_task') counters.claim++;
        if (rpc === 'rpc_gdpr_ack_cleanup_attempt') counters.ack++;
        let key;
        if (req.method === 'DELETE' && authTarget) {
          counters.authDelete++;
          assert.equal(counters.authDelete, 1, 'Auth DELETE must never be dispatched twice');
          assert.equal(body?.should_soft_delete, false, 'the existing application must request its real hard-delete contract');
          assert.equal(local.sql(`SELECT count(*) FROM public.app_user_profile p JOIN auth.users u ON u.id=p.id
            WHERE p.id='${authSubject}' AND (p.role IS NULL OR p.role='tourism_agent') AND u.deleted_at IS NULL`,
          'ordinary target profile must still exist immediately before real Auth dispatch'), '1');
        } else if (req.method === 'DELETE' && emptyLegacy) {
          // user/delete always queues this legacy cleanup, even with no avatar.
          // No avatar is uploaded or inventoried by this Auth-only addition.
          assert.deepEqual(body?.prefixes, [`${authSubject}/avatar.jpg`]);
          assert.equal(local.sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='avatars'
            AND starts_with(name,'${authSubject}/')`, 'the owned Auth target has no avatar bytes'), '0');
          counters.emptyLegacyCleanup++;
          assert.equal(counters.emptyLegacyCleanup, 1);
        } else if (req.method === 'DELETE') {
          assert.ok(body?.prefixes?.length === 1 && removable.has(body.prefixes[0]), 'only the two exact owned targets may be removed');
          key = body.prefixes[0];
          removes.set(key, (removes.get(key) ?? 0) + 1);
          assert.equal(removes.get(key), 1, 'a target must never be dispatched twice');
        }
        const headers = Object.fromEntries(Object.entries(req.headers).filter(([name]) =>
          !['host', 'connection', 'content-length', 'transfer-encoding'].includes(name)));
        const upstream = await fetch(url, { method: req.method, headers, redirect: 'error',
          ...(bytes.length ? { body: bytes } : {}), signal: AbortSignal.timeout(15_000) });
        const response = Buffer.from(await upstream.arrayBuffer());
        assert.ok(response.length <= 1024 * 1024, 'bounded fixture API response required');
        let lose = false;
        if (rpc === 'rpc_gdpr_start_erasure' && !authPhase) {
          assert.equal(counters.start, 1, 'lookup/resume must never send START again');
          assert.ok(upstream.ok && uuid.test(JSON.parse(response).operationId), 'real START must commit before response loss');
          operationId = JSON.parse(response).operationId;
          counters.lostStart++; lose = true;
        } else if (key && !unknownKey) {
          assert.ok(upstream.ok, 'first real DELETE must be accepted before losing its ACK');
          unknownKey = key;
          counters.lostStorage++;
          acceptedDelete.release();
          await bounded(releaseStorageResponse.promise, 'concurrent RESUME did not finish while the first Storage ACK was held');
          lose = true;
        } else if (rpc === 'rpc_gdpr_ack_cleanup_attempt' && body.p_success === true && !authPhase) {
          assert.ok(upstream.ok && !confirmedTask, 'the successful ACK must commit exactly once');
          confirmedTask = body.p_task_id;
          counters.lostAck++; lose = true;
        } else if (req.method === 'DELETE' && authTarget) {
          assert.ok(upstream.ok, 'real GoTrue DELETE must accept before its response is lost');
          counters.lostAuth++;
          lose = true;
        }
        res.writeHead(lose ? 503 : upstream.status, { 'content-type': 'application/json' });
        res.end(lose ? JSON.stringify({ code: 'SYNTHETIC_ACK_LOST', message: 'Synthetic committed response unavailable' }) : response);
      } catch {
        errors.push('unexpected fixture proxy request or backend contract');
        acceptedDelete.release(); releaseStorageResponse.release();
        if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json' });
        res.end('{"code":"FIXTURE_FAILED"}');
      }
    });
    proxy.listen(0, '127.0.0.1');
    await once(proxy, 'listening');
    app = await startApp({ ...local, origin: `http://127.0.0.1:${proxy.address().port}` }, { signDocuments: true });
    await waitForApp(app);

    const start = await post({ requestId, subjectKind: 'actor', subjectId: subject, mode: 'delete', reason: 'Synthetic HTTP proof' });
    assert.ok(start.status >= 400 && start.body.error === 'erase_failed', 'a lost committed START response must not be reported as success');
    assert.ok(uuid.test(operationId), 'real committed operation receipt required');
    assert.deepEqual([counters.start, counters.lostStart, counters.claim, removes.size], [1, 1, 0, 0],
      'START response loss must occur before Next processes any task');
    assert.equal(local.sql(`SELECT count(*) FROM public.gdpr_erasure_log WHERE id='${operationId}'
      AND report->>'startRequestId'='${requestId}' AND subject_id='${subject}'`, 'one committed START receipt'), '1');
    const found = await post({ requestId });
    assert.equal(found.status, 200);
    assert.deepEqual(found.body, { requestId, operationId });
    assert.deepEqual([counters.start, counters.claim, removes.size], [1, 0, 0], 'lookup must only recover the committed reference');
    assert.equal(state().length, 2, 'only the two unshared files produce cleanup tasks');

    const firstResume = post({ operationId });
    // Handle failure now while the concurrent proof is waiting on a real event.
    void firstResume.catch(() => {});
    try {
      await bounded(acceptedDelete.promise, 'first RESUME did not reach an accepted real Storage DELETE');
      assert.equal(errors.length, 0);
      const secondResume = await post({ operationId });
      assert.equal(secondResume.status, 207);
      assert.ok(confirmedTask, 'second RESUME must commit the other target ACK while the first is held');
      const midway = state();
      assert.ok(midway.some((t) => t.id === confirmedTask && t.status === 'succeeded' && t.attemptState === 'succeeded'),
        'lost SQL ACK response must retain the real committed success');
    } finally { releaseStorageResponse.release(); }
    const finished = await firstResume;
    assert.equal(finished.status, 207);
    assert.equal(finished.body.status, 'partial');
    assert.equal(finished.body.report.manualReviewRequired, true, 'shared retention must remain explicit');
    const final = state();
    assert.ok(final.some((t) => t.path === unknownKey && t.status === 'failed' && t.attemptState === 'unknown'),
      'lost Storage ACK must remain durably unknown');
    assert.ok(final.some((t) => t.id === confirmedTask && t.status === 'succeeded' && t.attemptState === 'succeeded'));
    assert.deepEqual([...removes.values()], [1, 1]);
    assert.deepEqual([counters.start, counters.lostStart, counters.lostStorage, counters.lostAck], [1, 1, 1, 1]);
    assert.equal((await post({ operationId })).status, 207);
    assert.deepEqual(state(), final, 'RESUME must not rearm either lost-ACK outcome');
    assert.deepEqual([...removes.values()], [1, 1]);
    for (const key of keys.slice(0, 2)) {
      const result = await local.request(`/storage/v1/object/authenticated/${bucket}/${key}`, local.service, undefined, 'GET');
      assert.ok([400, 404].includes(result.status), 'removed bytes must refuse without an Auth or server failure');
      const info = await local.request(`/storage/v1/object/info/${bucket}/${key}`, local.service, undefined, 'GET');
      const absent = await info.json();
      assert.ok((info.status === 404 || (info.status === 400 && Number(absent.statusCode) === 404))
        && ['NoSuchKey', 'NoSuchObject', 'not_found'].includes(storageErrorIdentity(absent)),
      'accepted DELETE must leave an explicit versioned not-found object identity');
      assert.equal(local.sql(`SELECT count(*) FROM storage.objects WHERE bucket_id='${bucket}' AND name='${key}'`, 'removed fixture object metadata'), '0');
    }
    const shared = await local.request(`/storage/v1/object/authenticated/${bucket}/${keys[2]}`, local.service, undefined, 'GET');
    assert.ok(shared.ok, 'the shared file must remain readable');
    assert.equal(sha(Buffer.from(await shared.arrayBuffer())), sha(pdf));
    assert.equal(local.sql(`SELECT count(*) FROM public.crm_task_document WHERE task_id='${otherTask}' AND document_id='${documents[2]}'`, 'shared association retained'), '1');

    // One ordinary Auth target, created and registered only in this owned stack.
    // SQL user/delete redacts but keeps its profile until GoTrue deletes the user.
    assert.equal(local.sql(`SELECT count(*) FROM auth.users WHERE id='${authSubject}'`, 'Auth fixture UUID unused'), '0');
    const authEmail = `gdpr-auth-${authSubject}@example.invalid`;
    const created = await local.request('/auth/v1/admin/users', local.service, {
      id: authSubject, email: authEmail, password: `Disposable!7-${randomUUID()}`, email_confirm: true,
    });
    assert.ok(created.ok, 'owned ordinary Auth fixture creation must succeed');
    const registered = await created.json();
    assert.ok(registered.id === authSubject && registered.email === authEmail && registered.email_confirmed_at,
      'only the exact confirmed identity returned by this creation enters the teardown registry');
    authRegistered = true;
    commit(`INSERT INTO public.app_user_profile(id,role) VALUES('${authSubject}','tourism_agent')
      ON CONFLICT(id) DO NOTHING`, 'ensure the ordinary synthetic application profile exists');
    assert.equal(local.sql(`SELECT count(*) FROM public.app_user_profile WHERE id='${authSubject}'
      AND (role IS NULL OR role='tourism_agent') AND avatar_url IS NULL`, 'ordinary owned target profile'), '1');
    const beforeAuth = await local.request(`/auth/v1/admin/users/${authSubject}`, local.service, undefined, 'GET');
    assert.ok(beforeAuth.ok && (await beforeAuth.json()).id === authSubject, 'real GoTrue must positively read the owned Auth target before erasure');
    authPhase = true;
    const authStart = await post({ requestId: randomUUID(), subjectKind: 'user', subjectId: authSubject,
      mode: 'delete', reason: 'Synthetic Auth HTTP proof' });
    assert.equal(authStart.status, 207);
    assert.equal(authStart.body.status, 'partial');
    authOperationId = authStart.body.operationId;
    assert.ok(uuid.test(authOperationId) && authOperationId !== operationId);
    assert.deepEqual([counters.authDelete, counters.lostAuth, counters.start], [1, 1, 2]);
    const authState = () => JSON.parse(local.sql(`SELECT json_agg(json_build_object('id',id,'action',action,
      'status',status,'attemptState',attempt_state) ORDER BY id) FROM internal.gdpr_cleanup_task
      WHERE operation_id='${authOperationId}'`, 'durable owned Auth operation'));
    const authFinal = authState();
    assert.equal(authFinal.filter((t) => t.action === 'auth_delete').length, 1);
    assert.ok(authFinal.some((t) => t.action === 'auth_delete' && t.status === 'failed' && t.attemptState === 'unknown'),
      'accepted Auth DELETE with lost response must remain durably unknown');
    const afterAuth = await local.request(`/auth/v1/admin/users/${authSubject}`, local.service, undefined, 'GET');
    const absentAuth = await afterAuth.json();
    assert.ok(afterAuth.status === 404 && (typeof absentAuth.code === 'string' ? absentAuth.code : absentAuth.error_code) === 'user_not_found',
      'real GoTrue must explicitly report that exact owned user as missing');
    assert.equal(local.sql(`SELECT count(*) FROM auth.users WHERE id='${authSubject}'`, 'hard-deleted owned Auth target'), '0');
    const authResume = await post({ operationId: authOperationId });
    assert.equal(authResume.status, 207);
    assert.equal(authResume.body.status, 'partial');
    assert.deepEqual(authState(), authFinal, 'RESUME must retain the unknown Auth receipt without rearming');
    assert.deepEqual([counters.authDelete, counters.lostAuth, counters.start], [1, 1, 2], 'RESUME must never send a second Auth DELETE or START');
    assert.deepEqual([...removes.values()], [1, 1]);
    console.log('Real Auth DELETE accepted once; its lost response stays unknown/partial, GoTrue confirms absence, and RESUME emits no second DELETE.');

    commit(`UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='${writerId}'`, 'revoke current fixture authority without refreshing its JWT');
    const beforeRefusal = { ...counters };
    const journalCount = local.sql('SELECT count(*) FROM public.gdpr_erasure_log', 'record journal count before refusal');
    for (const body of [{ requestId }, { operationId }]) {
      const refused = await post(body); // byte-identical GoTrue authorization captured above
      assert.equal(refused.status, 403);
      assert.deepEqual(refused.body, { error: 'platform_superuser_required' });
    }
    assert.deepEqual(counters, beforeRefusal, 'revocation must precede START/status/claim/ACK/provider dispatch');
    assert.equal(local.sql('SELECT count(*) FROM public.gdpr_erasure_log', 'verify refusal adds no journal'), journalCount);
    assert.deepEqual(state(), final);
    assert.deepEqual([...removes.values()], [1, 1]);
    assert.deepEqual(errors, []);
  } finally {
    releaseStorageResponse.release();
    try { if (app) await stopApp(app); }
    finally {
      if (proxy) { proxy.closeAllConnections(); await new Promise((resolve) => proxy.close(resolve)); }
      for (const key of uploaded) {
        const removed = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: [key] }, 'DELETE');
        assert.ok(removed.ok, 'exact synthetic Storage teardown must succeed');
      }
      if (fixtureCreated) {
        local.sqlFile(resolve('supabase/releases/20261108_gdpr_cleanup/close.sql'), 'close the exact GDPR capability without discarding receipts');
        commit(`UPDATE public.app_user_profile SET role='tourism_agent' WHERE id='${writerId}';
        DELETE FROM internal.gdpr_cleanup_task WHERE operation_id IN
          (SELECT id FROM public.gdpr_erasure_log WHERE (subject_kind='actor' AND subject_id='${subject}')
            OR (subject_kind='user' AND subject_id='${authSubject}'));
        DELETE FROM public.gdpr_erasure_log WHERE (subject_kind='actor' AND subject_id='${subject}')
          OR (subject_kind='user' AND subject_id='${authSubject}');
        DELETE FROM public.crm_task WHERE id IN ('${task}','${otherTask}');
        DELETE FROM public.ref_document WHERE id IN (${documents.map((id) => `'${id}'`).join(',')});
        DELETE FROM public.actor WHERE id IN ('${subject}','${otherActor}');
        NOTIFY pgrst,'reload schema'`, 'remove only the owned GDPR fixture records');
      }
      if (authRegistered) {
        const remaining = await local.request(`/auth/v1/admin/users/${authSubject}`, local.service, undefined, 'GET');
        if (remaining.ok) {
          assert.equal((await remaining.json()).id, authSubject, 'teardown must retain its exact creation binding');
          const deleted = await local.request(`/auth/v1/admin/users/${authSubject}`, local.service, { should_soft_delete: false }, 'DELETE');
          assert.ok(deleted.ok, 'only the registered synthetic Auth target may be cleaned on a failed recipe');
        } else {
          const missing = await remaining.json();
          assert.ok(remaining.status === 404 && (typeof missing.code === 'string' ? missing.code : missing.error_code) === 'user_not_found',
            'an absent target must not be deleted again during teardown');
        }
      }
      assert.equal(closed(), 't', 'the candidate must return to owner-only after the HTTP witness');
    }
  }
}
