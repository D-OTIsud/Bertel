import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { request } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import { startApp, stopApp, waitForApp } from './editor-races.mjs';

const taskRoute = '/api/task-document';
const actorRoute = '/api/actor-document';
const boundary = 'sec04-disposable-witness';
const multipartType = 'multipart/form-data; boundary=' + boundary;
const taskEnvelopeLimit = 21 * 1024 * 1024;
const pdf = Buffer.from('%PDF-1.4\n% synthetic upload witness\n%%EOF\n', 'ascii');
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const filename = 'sec04-witness.pdf';

function openUpload(origin, path, authorization) {
  const target = new URL(path, origin);
  assert.ok(target.origin === origin && target.protocol === 'http:' && target.hostname === '127.0.0.1'
    && target.port && !target.username && !target.password && [taskRoute, actorRoute].includes(target.pathname),
  'upload must stay on the owned Next origin');
  const socket = request(target, {
    method: 'POST', agent: false, signal: AbortSignal.timeout(35_000),
    headers: { authorization, 'content-type': multipartType, 'transfer-encoding': 'chunked' },
  });
  assert.equal(socket.hasHeader('content-length'), false);
  let settled = false;
  const result = new Promise((resolve, reject) => {
    socket.once('error', reject);
    socket.once('response', (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.once('error', reject);
      response.once('end', () => {
        try {
          resolve({ status: response.statusCode, headers: response.headers,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')) });
        } catch {
          reject(new Error('Next returned a non-JSON upload response (' + response.statusCode + ')'));
        }
      });
    });
  }).finally(() => { settled = true; });
  // A deliberately destroyed upload may reject before the next HTTP probe completes.
  void result.catch(() => {});
  return { socket, result, pending: () => !settled && !socket.destroyed };
}

function writeChunk(socket, bytes) {
  return new Promise((resolve, reject) => socket.write(bytes, (error) => error ? reject(error) : resolve()));
}

async function post(origin, path, authorization, body) {
  const upload = openUpload(origin, path, authorization);
  try {
    upload.socket.end(body);
    return await upload.result;
  } finally {
    upload.socket.destroy();
  }
}

function expectRefusal(response, status, code) {
  assert.equal(response.status, status, 'upload HTTP status; route code ' + response.body.error);
  assert.equal(response.body.error, code);
}

function taskMultipart(taskId) {
  return Buffer.concat([
    Buffer.from('--' + boundary + '\r\nContent-Disposition: form-data; name="task_id"\r\n\r\n'
      + taskId + '\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="'
      + filename + '"\r\nContent-Type: application/pdf\r\n\r\n'),
    pdf,
    Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);
}

export async function testTaskMultipartHttp({ local, commit, objectId, writerId, writerAuthorization, foreignAuthorization }) {
  assert.ok(process.platform === 'linux' && objectId === 'HOTRUN999999AR01' && uuid.test(writerId)
    && writerAuthorization !== foreignAuthorization && new URL(local.origin).hostname === '127.0.0.1',
  'exact owned Linux fixture and two distinct GoTrue identities required');
  const taskId = randomUUID();
  const prefix = 'tasks/' + taskId + '/';
  const storedPaths = () => JSON.parse(local.sql(
    "SELECT coalesce(json_agg(name ORDER BY name), '[]')::text FROM storage.objects "
      + "WHERE bucket_id='actor-documents' AND starts_with(name, '" + prefix + "')", 'read fixture storage entries'));
  const attachmentCount = () => local.sql("SELECT count(*) FROM public.crm_task_document WHERE task_id='" + taskId + "'",
    'count fixture attachments');
  const exactPath = (path) => path.startsWith(prefix) && path.endsWith('.pdf') && uuid.test(path.slice(prefix.length, -4));

  assert.deepEqual(storedPaths(), []);
  commit("INSERT INTO public.crm_task(id,object_id,title,created_by) VALUES ('" + taskId + "','" + objectId
    + "','Synthetic multipart witness','" + writerId + "'); "
    + 'INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active) '
    + "SELECT 'ORGRUN999999AR01',role.id,permission.id,true FROM public.ref_org_business_role role "
    + 'CROSS JOIN public.ref_permission permission '
    + "WHERE role.code='editor' AND permission.code='write_crm_notes' "
    + 'ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true',
  'synthetic task and editor CRM permission in its own organization');

  let app;
  const open = [];
  try {
    app = await startApp(local, { signDocuments: true });
    await waitForApp(app);
    const { origin } = app;
    const malformed = '--' + boundary + '\r\n'; // Missing headers and closing delimiter.
    const probeActor = () => post(origin, actorRoute, writerAuthorization, malformed);

    // Warm both real routes before holding live sockets. The safe probe can never write.
    expectRefusal(await probeActor(), 400, 'bad_multipart');
    expectRefusal(await post(origin, taskRoute, writerAuthorization, malformed), 400, 'bad_multipart');

    const oversized = openUpload(origin, taskRoute, writerAuthorization);
    try {
      const chunk = Buffer.alloc(256 * 1024);
      for (let bytes = 0; bytes < taskEnvelopeLimit; bytes += chunk.length) await writeChunk(oversized.socket, chunk);
      await writeChunk(oversized.socket, Buffer.alloc(1));
      // Leave the malformed multipart and the HTTP chunked message unfinished. The byte
      // ceiling must answer without waiting for the multipart parser or the terminating chunk.
      expectRefusal(await oversized.result, 413, 'request_body_too_large');
    } finally {
      oversized.socket.destroy();
    }

    for (let index = 0; index < 2; index += 1) {
      const upload = openUpload(origin, taskRoute, writerAuthorization);
      open.push(upload);
      await writeChunk(upload.socket, malformed);
    }
    async function waitForProbe(expected, interim) {
      const deadline = Date.now() + 10_000;
      for (;;) {
        const response = await probeActor();
        if (response.status === expected) return response;
        assert.equal(response.status, interim, 'unexpected cross-route probe status');
        assert.ok(Date.now() < deadline, 'cross-route upload lease did not change state');
        await sleep(100);
      }
    }
    const busy = await waitForProbe(429, 400);
    expectRefusal(busy, 429, 'too_many_requests');
    assert.equal(busy.headers['retry-after'], '2');
    assert.ok(open.every((upload) => upload.pending()), 'both task sockets must still hold their request body open');

    open[0].socket.destroy();
    expectRefusal(await waitForProbe(400, 429), 400, 'bad_multipart');
    assert.ok(open[1].pending(), 'the other task upload must still be open');

    const body = taskMultipart(taskId);
    expectRefusal(await post(origin, taskRoute, foreignAuthorization, body), 403, 'forbidden');
    assert.equal(attachmentCount(), '0');
    assert.deepEqual(storedPaths(), []);

    const success = await post(origin, taskRoute, writerAuthorization, body);
    assert.equal(success.status, 201, 'writer upload status; route code ' + success.body.error);
    assert.ok(uuid.test(success.body.documentId));
    assert.equal(success.body.title, filename);
    assert.equal(attachmentCount(), '1');
    const path = local.sql("SELECT d.storage_path FROM public.crm_task_document l JOIN public.ref_document d ON d.id=l.document_id "
      + "WHERE l.task_id='" + taskId + "' AND l.document_id='" + success.body.documentId + "' AND l.created_by='" + writerId
      + "' AND d.storage_bucket='actor-documents' AND d.access_scope='crm_private'", 'match the task link to its private file');
    assert.ok(exactPath(path));
    assert.deepEqual(storedPaths(), [path]);
    const stored = await local.request('/storage/v1/object/authenticated/actor-documents/' + path, local.service, undefined, 'GET');
    assert.equal(stored.status, 200);
    assert.deepEqual(Buffer.from(await stored.arrayBuffer()), pdf);
  } finally {
    for (const upload of open) upload.socket.destroy();
    try {
      if (app) await stopApp(app);
    } finally {
      const paths = storedPaths();
      if (paths.length) {
        assert.ok(paths.every(exactPath), 'only the exact synthetic task prefix may be cleaned');
        const removed = await local.request('/storage/v1/object/actor-documents', local.service, { prefixes: paths }, 'DELETE');
        assert.equal(removed.status, 200, 'remove only the synthetic task files');
        await removed.body?.cancel();
      }
      commit("DELETE FROM public.ref_document WHERE storage_bucket='actor-documents' AND access_scope='crm_private' "
        + "AND starts_with(storage_path, '" + prefix + "'); DELETE FROM public.crm_task WHERE id='" + taskId + "'",
      'remove the exact synthetic task and private attachments');
    }
  }
}
