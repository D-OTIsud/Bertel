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
  ['/rest/v1/rpc/get_object_workspace_permissions', 'legal-permission'],
]);

async function waitForRealmCatalogue(phase, expectedId, forbiddenId, corpus) {
  // A card may still be placeholder data while the exact search RPC is pending.
  await assertion.poll(() => {
    assert.ok(phase.catalogues.every((ids) => !ids.includes(forbiddenId)),
      `${corpus} catalogue exposed the opposite corpus in ${phase.catalogues.length} eligible responses`);
    return { eligibleResponses: phase.catalogues.length,
      expectedWitness: phase.catalogues.some((ids) => ids.includes(expectedId)) };
  }, { message: `${corpus} catalogue did not return its expected witness` }).toMatchObject({ expectedWitness: true });
}

export async function startApp(local, { signDocuments = false } = {}) {
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
      NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonymous.apikey,
      SUPABASE_SERVICE_ROLE_KEY: signDocuments ? local.service.apikey : '',
    },
  });
  return { origin, server, safeEnv };
}

export async function waitForApp({ origin, server }) {
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

export async function stopApp({ server }) {
  if (!server.pid || server.exitCode !== null || server.signalCode !== null) return;
  const exited = once(server, 'exit').then(() => true);
  try { process.kill(-server.pid, 'SIGTERM'); } catch (error) { if (error.code !== 'ESRCH') throw error; }
  assert.ok(await Promise.race([exited, sleep(10_000, false, { ref: false })]), 'owned Next editor did not stop');
}

export async function launchOwnedBrowser(app, local) {
  const permitted = new Set([app.origin, local.origin]);
  const exactPorts = Array.from(permitted, (origin) => {
    const url = new URL(origin);
    assert.ok(url.hostname === loopback && url.port, 'browser origins must use explicit owned loopback ports');
    return url.host;
  });
  assert.equal(exactPorts.length, 2, 'two distinct owned browser origins required');
  // Chromium can follow redirects without reentering the Playwright route handler.
  const rejectProxy = createHttpServer((_request, response) => response.writeHead(403, { Connection: 'close' }).end());
  rejectProxy.on('connect', (_request, socket) => socket.destroy());
  rejectProxy.on('upgrade', (_request, socket) => socket.destroy());
  try {
    rejectProxy.listen(0, loopback);
    await once(rejectProxy, 'listening');
    const browser = await chromium.launch({ env: app.safeEnv, args: [
      '--disable-background-networking',
      '--proxy-server=http://' + loopback + ':' + rejectProxy.address().port,
      '--proxy-bypass-list=<-loopback>;' + exactPorts.join(';'),
    ] });
    return {
      permitted,
      async newContext() {
        const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
        await context.routeWebSocket('**/*', (route) => {
          const url = new URL(route.url());
          url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
          if (permitted.has(url.origin)) route.connectToServer();
          else route.close();
        });
        return context;
      },
      async close() {
        try { await browser.close(); }
        finally { rejectProxy.close(); }
      },
    };
  } catch (error) {
    rejectProxy.close();
    throw error;
  }
}

export async function testEditorRaces({ local, objectId, writerId, email, password, secondAccount, realmAccount }) {
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
  let ownedBrowser;
  let closing = false;
  let routeFailure;
  const holds = new Map();
  const releases = [];
  const patches = [];
  let publishCalls = 0;
  let restoreCalls = 0;
  const legalRecordId = '00000000-0000-4000-a000-00000000ae43';
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
    ownedBrowser = await launchOwnedBrowser(app, local);
    const { permitted } = ownedBrowser;
    const destination = '/objects/' + objectId + '/edit';
    const editorUrl = app.origin + destination;
    const loginUrl = app.origin + '/login?from=' + encodeURIComponent(destination);
    function isRealmDocument(request, realm) {
      if (request.method() !== 'GET' || request.resourceType() !== 'document' || !request.isNavigationRequest()) return false;
      const url = new URL(request.url());
      return url.origin === app.origin && url.pathname === '/explorer' && url.searchParams.get('search') === realm.search;
    }
    async function routeEditorRequest(route, scene) {
      const request = route.request();
      const url = new URL(request.url());
      if (!permitted.has(url.origin)) return route.abort().catch(() => {});
      if (url.origin === app.origin && request.method() === 'GET' && url.pathname === '/login'
        && (url.searchParams.has('email') || url.searchParams.has('password'))) {
        if (!closing && !scene.closed) routeFailure ??= new Error('Editor login attempted a native GET form submission');
        return route.abort().catch(() => {});
      }
      if (!scene.nativeLoginRequested && url.href === scene.loginUrl && request.isNavigationRequest() && request.method() === 'GET') {
        scene.nativeLoginRequested = true;
        return route.continue();
      }
      if (scene.reload && !scene.reload.nativeDocument && url.href === editorUrl
        && request.resourceType() === 'document' && request.isNavigationRequest() && request.method() === 'GET') {
        scene.reload.nativeDocument = true;
        return route.continue();
      }
      const realm = scene.realm;
      if (realm?.reloadStarted && !realm.nativeDocument && isRealmDocument(request, realm)) {
        realm.nativeDocument = true;
        return route.continue();
      }
      const realmPhase = realm && (realm.nativeDocument ? realm.after : !realm.reloadStarted ? realm.before : null);
      const reload = scene.reload?.nativeDocument ? scene.reload : null;
      const draftScope = scene.draftScope;
      let kind;
      if (url.origin === local.origin) {
        if (realmPhase && request.method() === 'POST' && url.pathname === '/rest/v1/rpc/current_user_test_realm') {
          kind = 'realm-bootstrap';
        } else if (realmPhase && request.method() === 'POST' && url.pathname === '/rest/v1/rpc/list_object_resources_filtered_page') {
          const body = request.postDataJSON();
          if (body?.p_search === realm.search && body?.p_view === 'card' && Array.isArray(body.p_status)
            && body.p_status.includes('draft') && body.p_status.includes('published')) {
            kind = 'realm-catalogue';
          }
        } else if (reload && request.method() === 'GET' && url.pathname === '/auth/v1/user') {
          kind = 'reload-auth';
        } else if (draftScope && request.method() === 'POST' && url.pathname === '/auth/v1/logout') {
          kind = 'draft-logout';
        } else if (request.method() === 'PATCH' && url.pathname === '/rest/v1/object' && url.searchParams.get('id') === 'eq.' + objectId) {
          kind = 'patch';
          patches.push(request.postDataJSON().name);
        } else if (scene.legalMode && request.method() === 'PATCH' && url.pathname === '/rest/v1/object_legal'
          && url.searchParams.get('id') === 'eq.' + legalRecordId && request.postDataJSON()?.object_id === objectId) {
          kind = 'legal-write';
        } else if (request.method() === 'POST' && url.pathname.startsWith('/rest/v1/rpc/')) {
          const rpcKind = editorRpcKinds.get(url.pathname) ?? (scene.legalMode ? legalRpcKinds.get(url.pathname) : undefined);
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
            && claims.role === 'authenticated' && claims.sub === (realm?.account.userId ?? draftScope?.userId ?? writerId),
          'browser must use the exact synthetic user JWT and anonymous API key');
          if (kind === 'realm-bootstrap' || kind === 'realm-catalogue') {
            if (realmPhase === realm.before) realm.authorization ??= headers.authorization;
            assert.ok(headers.authorization === realm.authorization, 'realm transition must reuse the exact original JWT');
          }
          failureStage = 'content-profile';
          if (kind === 'legal-write') assert.equal(headers['content-profile'], 'public');
          else if (kind !== 'patch' && kind !== 'reload-auth' && kind !== 'draft-logout') {
            assert.equal(headers['content-profile'], 'api');
          }
        }
        failureStage = 'response';
        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        assert.ok(response.status() < 300 || response.status() >= 400, 'unexpected HTTP redirect in browser fixture');
        if (kind === 'legal-summary') {
          assert.ok(response.ok(), 'authorized legal summary must work before fault injection');
          if (scene.legalMode === 'degraded') {
            failureStage = 'deliver-synthetic-summary-failure';
            await route.fulfill({ status: 503, headers: { 'access-control-allow-origin': app.origin },
              json: { code: 'FQ08', message: 'Synthetic compliance summary unavailable' } });
            scene.summaryFailures += 1;
            if (reload) reload.summary503 = true;
          } else {
            await route.fulfill({ response });
            scene.summaryReads += 1;
          }
          return;
        }
        if (kind === 'realm-bootstrap' || kind === 'realm-catalogue') {
          assert.ok(response.ok());
          failureStage = 'realm-response';
          const body = await response.json();
          if (kind === 'realm-bootstrap') realmPhase.realms.push(body);
          else {
            assert.ok(Array.isArray(body?.data), 'expected the real Explorer catalogue response');
            realmPhase.catalogues.push(body.data.map((row) => row.id));
          }
        } else if (kind === 'legal-read') {
          assert.ok(response.ok());
          failureStage = 'fixture-legal-record';
          const records = await response.json();
          assert.ok(Array.isArray(records) && records.some((record) =>
            record.id === legalRecordId && record.type?.code === 'raison_sociale'));
          scene.legalReads += 1;
          if (reload) reload.legalRecord = true;
        } else if (kind === 'legal-permission') {
          assert.ok(response.ok());
          failureStage = 'fixture-legal-permission';
          assert.equal((await response.json())?.legal, true);
          scene.legalPermissions += 1;
          if (reload) reload.legalPermission = true;
        } else if (kind === 'reload-auth') {
          assert.ok(response.ok());
          failureStage = 'reload-authenticated-user';
          assert.equal((await response.json())?.id, writerId);
          reload.authenticatedUser = true;
        } else if (kind === 'legal-write') {
          assert.ok(response.ok());
          scene.legalWrites += 1;
        } else if (kind === 'draft-logout') {
          assert.ok(response.ok(), 'GoTrue must accept sign-out for the current account');
          draftScope.loggedOut = true;
        }
        const reread = kind === 'reread' ? holds.get(kind) : undefined;
        if (kind === 'reread' && (reread || reload || draftScope) && response.ok()) {
          // Save and publish also refetch the workspace. Hold only the restored resource.
          const body = await response.json();
          const detail = body?.object ?? body;
          if (reload && detail?.id === objectId) reload.workspace = true;
          if (draftScope && detail?.id === objectId) draftScope.workspace = true;
          if (reread && holds.get(kind) === reread && detail?.id === objectId && detail?.name === historic[1]) {
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
        if (!closing && !scene.closed && kind) {
          const failure = new Error('Editor browser route failed: ' + kind + ' (' + failureStage + ')');
          routeFailure ??= failure;
          gate?.observed.resolve(failure);
        }
        await route.abort().catch(() => {});
      }
    }

    async function signInEditor(page, credentials, target = editorUrl) {
      // The prerendered form can be visible before its client handlers are attached.
      const forgotPassword = page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
      const returnToLogin = page.getByRole('button', { name: 'Retour à la connexion', exact: true });
      const submitLogin = page.getByRole('button', { name: 'Se connecter', exact: true });
      await assertion(async () => {
        if (await returnToLogin.isVisible()) return;
        await forgotPassword.click({ timeout: 1000 });
        await assertion(returnToLogin).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await assertion(async () => {
        if (!(await submitLogin.isVisible())) await returnToLogin.click({ timeout: 1000 });
        await assertion(submitLogin).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await page.getByLabel('Adresse e-mail').fill(credentials.email);
      await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password);
      await submitLogin.click();
      await page.waitForURL(target, { timeout: 60_000 });
    }

    async function openAuthenticatedEditor(legalMode, draftScope, realm) {
      const context = await ownedBrowser.newContext();
      const target = realm?.url ?? editorUrl;
      const requestedLogin = realm ? app.origin + '/login?from=' + encodeURIComponent(realm.destination) : loginUrl;
      const scene = { legalMode, draftScope, realm, loginUrl: requestedLogin,
        closed: false, nativeLoginRequested: false, pageErrors: 0,
        legalReads: 0, legalPermissions: 0, summaryReads: 0, summaryFailures: 0, legalWrites: 0 };
      await context.route('**/*', (route) => routeEditorRequest(route, scene));
      const page = await context.newPage();
      if (draftScope) page.on('pageerror', () => { scene.pageErrors += 1; });
      const login = await page.goto(requestedLogin);
      assert.ok(scene.nativeLoginRequested && login?.status() === 200 && login.url() === requestedLogin
        && login.request().redirectedFrom() === null, 'exact native login document must return HTTP 200 without redirects');
      await signInEditor(page, realm?.account ?? { email, password }, target);
      return { page, scene, close: async () => {
        scene.closed = true;
        await context.close();
      } };
    }

    async function openLegalSection(page) {
      const fullMode = page.getByRole('button', { name: 'Complet', exact: true });
      await fullMode.click();
      await assertion(fullMode).toHaveAttribute('aria-pressed', 'true');
      await page.locator('.edit-nav').getByRole('button', { name: /Juridique/ }).click();
      const legal = page.locator('#section-18');
      await assertion(legal.getByRole('heading', { name: /Juridique/ })).toBeVisible();
      return {
        company: legal.getByLabel('Raison sociale', { exact: true }),
        banner: legal.getByText('Résumé de conformité indisponible. Les données juridiques restent modifiables.', { exact: true }),
      };
    }

    const races = await openAuthenticatedEditor();
    const { page } = races;
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
    await races.close();

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
    const healthy = await openAuthenticatedEditor('healthy');
    const healthyLegal = await openLegalSection(healthy.page);
    await assertion(healthyLegal.company).toHaveValue('Synthetic legal company before');
    await assertion(healthyLegal.banner).toHaveCount(0);
    await assertion.poll(() => ({
      realLegalPermission: healthy.scene.legalPermissions > 0,
      realLegalRecord: healthy.scene.legalReads > 0,
      realSummary: healthy.scene.summaryReads > 0,
    })).toEqual({ realLegalPermission: true, realLegalRecord: true, realSummary: true });
    await healthy.close();

    const degraded = await openAuthenticatedEditor('degraded');
    const { company, banner } = await openLegalSection(degraded.page);
    await assertion.poll(() => ({
      realLegalPermission: degraded.scene.legalPermissions > 0,
      realLegalRecord: degraded.scene.legalReads > 0,
      syntheticSummaryFailure: degraded.scene.summaryFailures > 0,
    })).toEqual({ realLegalPermission: true, realLegalRecord: true, syntheticSummaryFailure: true });
    await assertion(banner).toBeVisible();
    await assertion(company).toHaveValue('Synthetic legal company before');
    await company.fill('Synthetic legal company saved');
    const saveLegal = degraded.page.locator('.edit-top__right').getByRole('button', { name: 'Enregistrer', exact: true });
    await assertion(saveLegal).toBeEnabled();
    await saveLegal.click();
    await assertion.poll(() => degraded.scene.legalWrites).toBe(1);
    await assertion.poll(legalValue).toBe('Synthetic legal company saved');
    assert.equal(patches.length, 2);

    // Only change the document lifecycle. Keep the same context, identity and summary fault.
    await assertion(degraded.page.getByText('Brouillon enregistré', { exact: true })).toBeVisible();
    const reload = { nativeDocument: false, authenticatedUser: false, workspace: false,
      legalPermission: false, legalRecord: false, summary503: false };
    degraded.scene.reload = reload;
    let pageErrors = 0;
    degraded.page.on('pageerror', () => { pageErrors += 1; });
    try {
      const documentResponse = await degraded.page.reload();
      assert.ok(reload.nativeDocument && documentResponse?.status() === 200 && documentResponse.url() === editorUrl
        && documentResponse.request().redirectedFrom() === null, 'native editor reload must return HTTP 200 without redirects');
      const navigationType = await degraded.page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type);
      assert.equal(navigationType, 'reload');
      await assertion(degraded.page).toHaveURL(editorUrl);
      await assertion.poll(() => ({ ...reload })).toEqual({
        nativeDocument: true, authenticatedUser: true, workspace: true,
        legalPermission: true, legalRecord: true, summary503: true,
      });
    } catch (error) {
      throw new Error(`${error.message}\nReload phases: ${JSON.stringify(reload)}; uncaught page errors: ${pageErrors}`, { cause: error });
    }
    const reloadedLegal = await openLegalSection(degraded.page);
    await assertion(reloadedLegal.banner).toBeVisible();
    await assertion(reloadedLegal.company).toHaveValue('Synthetic legal company saved');
    await reloadedLegal.company.fill('Synthetic legal company saved after reload');
    await assertion(saveLegal).toBeEnabled();
    await saveLegal.click();
    await assertion.poll(() => degraded.scene.legalWrites).toBe(2);
    await assertion.poll(legalValue).toBe('Synthetic legal company saved after reload');
    assert.equal(patches.length, 2);
    await degraded.close();

    assert.ok(secondAccount?.id && secondAccount.id !== writerId, 'two distinct browser accounts are required');
    const canonicalBeforeDrafts = canonical();
    const mutationsBeforeDrafts = [patches.length, publishCalls, restoreCalls];
    const draftScene = await openAuthenticatedEditor(undefined, { userId: writerId });
    const draftPage = draftScene.page;
    const draftName = draftPage.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
    const storedDraft = (userId) => draftPage.evaluate((key) => localStorage.getItem(key),
      `object-editor-draft:${encodeURIComponent(userId)}:${encodeURIComponent(objectId)}`);
    const originalDraftName = 'Synthetic local name for first account only';
    async function signOutDraftEditor() {
      const scope = draftScene.scene.draftScope;
      assert.equal(draftScene.scene.pageErrors, 0);
      // The Next dev indicator occupies the same corner as the sidebar profile.
      const profile = draftPage.getByRole('button', { name: /^Profil / });
      await profile.focus();
      await assertion(profile).toBeFocused();
      await draftPage.keyboard.press('Enter');
      await draftPage.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
      await assertion(draftPage).toHaveURL(loginUrl);
      await assertion.poll(() => scope.loggedOut).toBe(true);
      await assertion(draftName).toHaveCount(0);
    }
    async function signInDraftEditor(userId, credentials) {
      const scope = { userId };
      draftScene.scene.draftScope = scope;
      await signInEditor(draftPage, credentials);
      await assertion.poll(() => scope.workspace).toBe(true);
    }

    await assertion.poll(() => draftScene.scene.draftScope.workspace).toBe(true);
    await assertion(draftName).toHaveValue(canonicalBeforeDrafts[0]);
    assert.equal(await storedDraft(writerId), null);
    await draftName.fill(originalDraftName);
    await assertion.poll(async () => JSON.parse((await storedDraft(writerId)) ?? '{}').draft?.generalInfo?.name)
      .toBe(originalDraftName);
    const firstDraft = await storedDraft(writerId);
    await signOutDraftEditor();
    assert.equal(await storedDraft(writerId), firstDraft);

    await signInDraftEditor(secondAccount.id, secondAccount);
    await assertion(draftName).toHaveValue(canonicalBeforeDrafts[0]);
    await assertion(draftName).toBeEditable();
    await assertion(draftPage.getByText(originalDraftName, { exact: true })).toHaveCount(0);
    assert.equal(await storedDraft(secondAccount.id), null);
    const otherDraftName = 'Synthetic local name for second account only';
    await draftName.fill(otherDraftName);
    await assertion.poll(async () => JSON.parse((await storedDraft(secondAccount.id)) ?? '{}').draft?.generalInfo?.name)
      .toBe(otherDraftName);
    assert.equal(await storedDraft(writerId), firstDraft);
    await signOutDraftEditor();
    assert.equal(await storedDraft(writerId), firstDraft);

    await signInDraftEditor(writerId, { email, password });
    await assertion(draftName).toHaveValue(originalDraftName);
    assert.deepEqual(canonical(), canonicalBeforeDrafts);
    assert.deepEqual([patches.length, publishCalls, restoreCalls], mutationsBeforeDrafts);
    assert.equal(draftScene.scene.pageErrors, 0);
    await draftScene.close();

    const testId = 'HOTRUN999999AR05', realId = 'HOTRUN999999AR02';
    const search = 'ACC04RealmWitness';
    const testName = search + ' test', realName = search + ' real';
    assert.equal(local.sql(`WITH renamed AS (
      UPDATE public.object SET name=CASE WHEN id='${testId}' THEN '${testName}' ELSE '${realName}' END
      WHERE (id='${testId}' AND is_test AND status='published')
         OR (id='${realId}' AND NOT is_test AND status='draft')
      RETURNING id
    ) SELECT count(*) FROM renamed`, 'name the two existing realm witnesses'), '2');
    const params = new URLSearchParams({ buckets: 'HOT', status: 'published,draft', search });
    const realmDestination = '/explorer?' + params;
    const realm = { account: realmAccount, search, destination: realmDestination, url: app.origin + realmDestination,
      before: { realms: [], catalogues: [] }, after: { realms: [], catalogues: [] } };
    const realmScene = await openAuthenticatedEditor(undefined, undefined, realm);
    try {
      const { page } = realmScene;
      const testCard = page.getByRole('heading', { name: testName, exact: true });
      const realCard = page.getByRole('heading', { name: realName, exact: true });
      const sandbox = page.getByText('Bac à sable', { exact: true });
      await assertion(testCard).toBeVisible();
      await assertion(realCard).toHaveCount(0);
      await assertion(sandbox).toBeVisible();
      assert.ok(realm.before.realms.length > 0 && realm.before.realms.every((value) => value === true));
      await waitForRealmCatalogue(realm.before, testId, realId, 'test');

      const moved = local.sql(`WITH changed AS (
        UPDATE public.user_org_membership SET org_object_id='ORGRUN999999AR02'
        WHERE id='00000000-0000-4000-a000-00000000ab16' AND user_id='${realmAccount.userId}'
          AND org_object_id='ORGRUN999999AR03' AND is_active
        RETURNING id
      ) SELECT count(*) FROM changed`, 'commit tester realm move');
      assert.equal(moved, '1');
      // Explorer can normalize query parameters with a history replacement. Observe
      // the reloaded document by its route and search value, independent of serialization.
      realm.reloadStarted = true;
      const [document] = await Promise.all([
        page.waitForResponse((response) => isRealmDocument(response.request(), realm)
          && response.request().frame() === page.mainFrame(), { timeout: 20_000 }),
        page.reload({ waitUntil: 'domcontentloaded' }),
      ]);
      assert.equal(realm.nativeDocument, true, 'realm witness must request a native Explorer document');
      assert.equal(document.status(), 200, 'native Explorer reload must succeed');
      assert.equal(document.request().redirectedFrom(), null, 'native Explorer reload must not follow a redirect');
      assert.equal(await page.evaluate(() => performance.getEntriesByType('navigation')[0]?.type), 'reload');
      await assertion(realCard).toBeVisible();
      await assertion(testCard).toHaveCount(0);
      await assertion(sandbox).toHaveCount(0);
      assert.ok(realm.after.realms.length > 0 && realm.after.realms.every((value) => value === false));
      await waitForRealmCatalogue(realm.after, realId, testId, 'real');
    } finally {
      await realmScene.close();
    }
  } catch (error) {
    throw routeFailure ?? error;
  } finally {
    closing = true;
    for (const release of releases) release();
    try {
      await ownedBrowser?.close();
    } finally {
      await stopApp(app);
    }
  }
  if (routeFailure) throw routeFailure;
}
