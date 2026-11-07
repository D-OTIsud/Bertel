import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer as createHttpServer } from 'node:http';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';
import { chromium, expect } from '@playwright/test';

const appDir = fileURLToPath(new URL('../../', import.meta.url));
const loopback = '127.0.0.1';
const assertion = expect.configure({ timeout: 20_000 });
const editorRpcKinds = new Map([
  ['/rest/v1/rpc/rpc_publish_object', 'publish'],
  ['/rest/v1/rpc/rpc_restore_object_version', 'restore'],
  ['/rest/v1/rpc/get_object_with_deep_data', 'reread'],
  ['/rest/v1/rpc/get_object_resource', 'reread'],
]);
const legalRpcKinds = new Map([
  ['/rest/v1/rpc/get_object_legal_data', 'legal-read'],
  ['/rest/v1/rpc/get_object_legal_compliance', 'legal-summary'],
]);

async function startApp(local) {
  const socket = createServer();
  socket.listen(0, loopback);
  await once(socket, 'listening');
  const { port } = socket.address();
  socket.close();
  await once(socket, 'close');
  const origin = 'http://' + loopback + ':' + port;
  const safeEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) =>
    ['PATH', 'HOME', 'LANG', 'TMPDIR', 'PLAYWRIGHT_BROWSERS_PATH'].includes(key)));
  const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '--hostname', loopback, '--port', String(port)], {
    cwd: appDir,
    detached: true,
    stdio: 'ignore',
    env: {
      ...safeEnv, NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_ENABLE_DEMO_MODE: 'false', NEXT_PUBLIC_SUPABASE_URL: local.origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonymous.apikey, SUPABASE_SERVICE_ROLE_KEY: '',
    },
  });
  return { origin, server, safeEnv };
}

async function waitForApp({ origin, server }) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline && server.exitCode === null && server.signalCode === null) {
    try {
      const response = await fetch(origin + '/login', { redirect: 'error', signal: AbortSignal.timeout(2000) });
      await response.body?.cancel();
      if (response.ok) return;
    } catch { /* The owned Next process is still starting. */ }
    await sleep(250);
  }
  throw new Error('Owned Next editor did not start on loopback');
}

export async function testEditorRaces({ local, objectId, writerId, email, password }) {
  assert.ok(process.platform === 'linux' && objectId === 'HOTRUN999999AR01', 'exact disposable Linux editor fixture required');
  local.sql("BEGIN; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',true);" +
    "INSERT INTO public.object_location(object_id, city, is_main_location) VALUES ('HOTRUN999999AR01','Saint-Denis',true);" +
    "INSERT INTO public.object_description(object_id, description, description_chapo, visibility) " +
    "VALUES ('HOTRUN999999AR01','Synthetic editorial description','Synthetic introduction','public'); COMMIT;",
  'add editor publication prerequisites');
  const canonical = () => JSON.parse(local.sql("SELECT json_build_array(name,status)::text FROM public.object WHERE id='HOTRUN999999AR01'",
    'read synthetic canonical name and status'));
  const historic = JSON.parse(local.sql("SELECT json_build_array(version_number,data->>'name')::text FROM public.object_version " +
    "WHERE object_id='HOTRUN999999AR01' ORDER BY version_number, created_at LIMIT 1", 'read synthetic version'));
  assert.ok(Number.isInteger(historic[0]) && historic[0] > 0 && typeof historic[1] === 'string' && historic[1] !== canonical()[0]);

  const app = await startApp(local);
  // Chromium can follow redirects without reentering the Playwright route handler.
  const rejectProxy = createHttpServer((_request, response) => response.writeHead(403, { Connection: 'close' }).end());
  rejectProxy.on('connect', (_request, socket) => socket.destroy());
  rejectProxy.on('upgrade', (_request, socket) => socket.destroy());
  let browser;
  let closing = false;
  let routeFailure;
  const holds = new Map();
  const releases = [];
  const patches = [];
  let publishCalls = 0;
  let restoreCalls = 0;
  const legalRecordId = '00000000-0000-4000-a000-00000000ae43';
  let legalWitness = false;
  let legalReads = 0;
  let legalSummaryFailures = 0;
  let legalWrites = 0;
  function hold(kind) {
    const gate = { observed: Promise.withResolvers(), release: Promise.withResolvers() };
    holds.set(kind, gate);
    releases.push(gate.release.resolve);
    return gate;
  }
  async function waitForHeldResponse(kind, gate) {
    const problem = await Promise.race([
      gate.observed.promise,
      sleep(40_000, new Error(kind + ' response was not observed'), { ref: false }),
    ]);
    if (problem) throw problem;
  }
  try {
    await waitForApp(app);
    const permitted = new Set([app.origin, local.origin]);
    const exactPorts = Array.from(permitted, (origin) => {
      const url = new URL(origin);
      assert.ok(url.hostname === loopback && url.port, 'browser origins must use explicit owned loopback ports');
      return url.host;
    });
    assert.equal(exactPorts.length, 2, 'two distinct owned browser origins required');
    rejectProxy.listen(0, loopback);
    await once(rejectProxy, 'listening');
    browser = await chromium.launch({ env: app.safeEnv, args: [
      '--disable-background-networking',
      '--proxy-server=http://' + loopback + ':' + rejectProxy.address().port,
      '--proxy-bypass-list=<-loopback>;' + exactPorts.join(';'),
    ] });
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
    const destination = '/objects/' + objectId + '/edit';
    const loginUrl = app.origin + '/login?from=' + encodeURIComponent(destination);
    let nativeLoginRequested = false;
    await context.routeWebSocket('**/*', (route) => {
      const url = new URL(route.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (permitted.has(url.origin)) route.connectToServer();
      else route.close();
    });
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!permitted.has(url.origin)) return route.abort().catch(() => {});
      if (url.origin === app.origin && request.method() === 'GET' && url.pathname === '/login'
        && (url.searchParams.has('email') || url.searchParams.has('password'))) {
        if (!closing) routeFailure ??= new Error('Editor login attempted a native GET form submission');
        return route.abort().catch(() => {});
      }
      if (!nativeLoginRequested && url.href === loginUrl && request.isNavigationRequest() && request.method() === 'GET') {
        nativeLoginRequested = true;
        return route.continue();
      }
      let kind;
      if (url.origin === local.origin) {
        if (request.method() === 'PATCH' && url.pathname === '/rest/v1/object' && url.searchParams.get('id') === 'eq.' + objectId) {
          kind = 'patch';
          patches.push(request.postDataJSON().name);
        } else if (legalWitness && request.method() === 'PATCH' && url.pathname === '/rest/v1/object_legal'
          && url.searchParams.get('id') === 'eq.' + legalRecordId && request.postDataJSON()?.object_id === objectId) {
          kind = 'legal-write';
        } else if (request.method() === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
          const rpcKind = editorRpcKinds.get(url.pathname) ?? (legalWitness ? legalRpcKinds.get(url.pathname) : undefined);
          if (rpcKind && request.postDataJSON()?.p_object_id === objectId) kind = rpcKind;
          if (kind === 'publish') publishCalls += 1;
          if (kind === 'restore') restoreCalls += 1;
        }
      }
      let gate = kind === 'reread' ? undefined : holds.get(kind);
      if (gate) holds.delete(kind);
      let failureStage = 'response';
      try {
        if (kind) {
          failureStage = 'jwt';
          const headers = await request.allHeaders();
          const bearer = headers.authorization?.split(' ');
          const claims = JSON.parse(Buffer.from(bearer?.[1]?.split('.')[1] ?? '', 'base64url'));
          assert.ok(headers.apikey === local.anonymous.apikey && bearer?.[0] === 'Bearer'
            && claims.role === 'authenticated' && claims.sub === writerId, 'browser must use the exact synthetic user JWT and anonymous API key');
          failureStage = 'content-profile';
          if (kind === 'legal-write') assert.equal(headers['content-profile'], 'public');
          else if (kind !== 'patch') assert.equal(headers['content-profile'], 'api');
        }
        failureStage = 'response';
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        assert.ok(response.status() < 300 || response.status() >= 400, 'unexpected HTTP redirect in browser fixture');
        if (kind === 'legal-summary') {
          assert.ok(response.ok(), 'authorized legal summary must work before fault injection');
          legalSummaryFailures += 1;
          return await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': app.origin },
            json: { code: 'FQ08', message: 'Synthetic compliance summary unavailable' } });
        }
        if (kind === 'legal-read' || kind === 'legal-write') {
          assert.ok(response.ok(), kind + ' must reach the real PostgREST fixture successfully');
          if (kind === 'legal-read') legalReads += 1;
          else legalWrites += 1;
        }
        const reread = kind === 'reread' ? holds.get(kind) : undefined;
        if (reread && response.ok()) {
          // Save and publish also refetch the workspace. Hold only the restored resource.
          const body = await response.json();
          const detail = body?.object ?? body;
          if (holds.get(kind) === reread && detail?.id === objectId && detail?.name === historic[1]) {
            gate = reread;
            holds.delete(kind);
          }
        }
        if (gate) {
          assert.ok(response.ok(), kind + ' backend request failed');
          gate.observed.resolve();
          await gate.release.promise;
        }
        await route.fulfill({ response });
      } catch {
        if (!closing && kind) {
          const failure = new Error('Editor browser route failed: ' + kind + ' (' + failureStage + ')');
          routeFailure ??= failure;
          gate?.observed.resolve(failure);
        }
        await route.abort().catch(() => {});
      }
    });

    const page = await context.newPage();
    const login = await page.goto(loginUrl);
    assert.ok(nativeLoginRequested && login?.status() === 200 && login.url() === loginUrl
      && login.request().redirectedFrom() === null, 'exact native login document must return HTTP 200 without redirects');
    // The prerendered form can be visible before its client handlers are attached.
    const forgotPassword = page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
    const returnToLogin = page.getByRole('button', { name: 'Retour à la connexion', exact: true });
    await assertion(async () => {
      if (await returnToLogin.isVisible()) return;
      await forgotPassword.click({ timeout: 1000 });
      await assertion(returnToLogin).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await returnToLogin.click();
    await page.getByLabel('Adresse e-mail').fill(email);
    await page.getByLabel('Mot de passe', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForURL(app.origin + destination, { timeout: 60_000 });
    const name = page.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
    const editorActions = page.locator('.edit-top__right');
    const publish = editorActions.getByRole('button', { name: 'Publier', exact: true });
    const save = editorActions.getByRole('button', { name: 'Enregistrer', exact: true });
    await assertion(name).toHaveValue(canonical()[0]);

    const patch = hold('patch');
    await name.fill('Synthetic publication saved first');
    await publish.click();
    await waitForHeldResponse('patch', patch);
    assert.deepEqual(canonical(), ['Synthetic publication saved first', 'draft']);
    await name.fill('Synthetic publication latest');
    patch.release.resolve();
    const deferred = page.getByRole('dialog', { name: 'Publication reportée' });
    await assertion(deferred).toBeVisible();
    await assertion(deferred.getByText(/Elle est conservée/)).toBeVisible();
    assert.equal(publishCalls, 0);
    await deferred.locator('button.btn.primary').click();
    await assertion(name).toHaveValue('Synthetic publication latest');
    await publish.click();
    await assertion.poll(canonical).toEqual(['Synthetic publication latest', 'published']);
    await assertion(publish).toBeEnabled();
    assert.deepEqual(patches, ['Synthetic publication saved first', 'Synthetic publication latest']);
    assert.equal(publishCalls, 1);

    assert.notEqual(canonical()[0], historic[1]);
    const restore = hold('restore');
    const reread = hold('reread');
    await page.getByRole('button', { name: /Versions \/ historique/ }).click();
    const history = page.getByRole('dialog', { name: 'Versions / historique' });
    await history.getByRole('button', { name: 'Restaurer la version ' + historic[0], exact: true }).click();
    await waitForHeldResponse('restore', restore);
    await history.locator('button.btn.primary').click();
    await assertion(name).toBeEditable();
    await name.fill('Synthetic edit during restore');
    await assertion(save).toBeDisabled();
    await assertion(publish).toBeDisabled();
    restore.release.resolve();
    await waitForHeldResponse('reread', reread);
    await assertion(name).toHaveValue('Synthetic edit during restore');
    await assertion(name).toBeEditable();
    await name.fill('Synthetic edit during reread');
    await assertion(save).toBeDisabled();
    await assertion(publish).toBeDisabled();
    reread.release.resolve();
    const keepLocal = page.getByRole('button', { name: 'Garder mes modifications' });
    const useServer = page.getByRole('button', { name: 'Utiliser les valeurs du serveur' });
    await assertion(keepLocal).toBeVisible();
    await assertion(name).toHaveValue('Synthetic edit during reread');
    assert.equal(canonical()[0], historic[1]);
    await useServer.click();
    await assertion(name).toHaveValue(historic[1]);
    assert.equal(restoreCalls, 1);
    assert.equal(patches.length, 2);
    assert.equal(publishCalls, 1);

    // Seed after the restore assertions so the original version remains unchanged.
    local.sql(`BEGIN;
      SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
      INSERT INTO public.org_role_permission(org_object_id,role_id,permission_id,is_active,granted_by)
        SELECT 'ORGRUN999999AR01',role_def.id,permission.id,true,'00000000-0000-4000-a000-00000000ae15'
        FROM public.ref_org_business_role role_def CROSS JOIN public.ref_permission permission
        WHERE role_def.code='editor' AND permission.code='manage_legal_compliance'
        ON CONFLICT ON CONSTRAINT org_role_permission_uniq DO UPDATE SET is_active=true;
      INSERT INTO public.object_legal(id,object_id,type_id,value,validity_mode)
        SELECT '${legalRecordId}','${objectId}',id,'{"value":"Synthetic legal company before"}'::jsonb,'forever'
        FROM public.ref_legal_type WHERE code='raison_sociale';
      COMMIT;`, 'seed the synthetic legal record and its current organization right');
    const legalValue = () => local.sql(`SELECT value->>'value' FROM public.object_legal
      WHERE id='${legalRecordId}' AND object_id='${objectId}'`, 'read the exact synthetic legal record');
    assert.equal(legalValue(), 'Synthetic legal company before');
    legalWitness = true;
    await page.reload();
    const legal = page.locator('#section-18');
    const company = legal.getByLabel('Raison sociale', { exact: true });
    await assertion(legal.getByText('Résumé de conformité indisponible. Les données juridiques restent modifiables.', { exact: true })).toBeVisible();
    await assertion(company).toHaveValue('Synthetic legal company before');
    assert.ok(legalReads > 0 && legalSummaryFailures > 0, 'legal data must be read while the summary fails in the browser');
    await company.fill('Synthetic legal company saved');
    await assertion(save).toBeEnabled();
    await save.click();
    await assertion.poll(() => legalWrites).toBe(1);
    await assertion.poll(legalValue).toBe('Synthetic legal company saved');
    assert.equal(patches.length, 2);
  } catch (error) {
    throw routeFailure ?? error;
  } finally {
    closing = true;
    for (const release of releases) release();
    try {
      await browser?.close();
    } finally {
      rejectProxy.close();
      if (app.server.pid && app.server.exitCode === null && app.server.signalCode === null) {
        try { process.kill(-app.server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
    }
  }
  if (routeFailure) throw routeFailure;
}
