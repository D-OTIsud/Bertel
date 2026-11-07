import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { expect } from '@playwright/test';
import { launchOwnedBrowser, startApp, stopApp, waitForApp } from './editor-races.mjs';

const expectUI = expect.configure({ timeout: 20_000 });
const generatedHotId = /^HOTRUN[A-Z0-9]{10}$/;

async function signIn(page, credentials, target) {
  // A prerendered login form can be visible before its client handlers are attached.
  const recover = page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
  const back = page.getByRole('button', { name: 'Retour à la connexion', exact: true });
  const submit = page.getByRole('button', { name: 'Se connecter', exact: true });
  await expectUI(async () => {
    if (!(await back.isVisible())) await recover.click({ timeout: 1000 });
    await expectUI(back).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expectUI(async () => {
    if (!(await submit.isVisible())) await back.click({ timeout: 1000 });
    await expectUI(submit).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel('Adresse e-mail').fill(credentials.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password);
  await submit.click();
  await page.waitForURL(target, { timeout: 60_000 });
}

export async function testCreatePublishBrowser({ local, commit, writerId, email, password }) {
  const gateway = new URL(local.origin);
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_EDITOR_BROWSER === 'true'
    && process.env.CURRENT_RIGHTS_DISPOSABLE === 'true' && gateway.protocol === 'http:'
    && gateway.hostname === '127.0.0.1' && gateway.port && gateway.origin === local.origin
    && writerId === '00000000-0000-4000-a000-00000000ae11'
    && email === 'current-rights-writer@example.invalid', 'exact disposable creation fixture required');

  const initialName = 'Synthetic HOT ' + randomUUID();
  const savedName = initialName + ' saved';
  let objectId;
  const owned = () => `created_by='${writerId}' AND object_type='HOT'
    AND (name IN ('${initialName}','${savedName}')${objectId ? ` OR id='${objectId}'` : ''})`;
  const ownedRows = () => JSON.parse(local.sql(
    `SELECT coalesce(jsonb_agg(id),'[]'::jsonb) FROM public.object WHERE ${owned()}`, 'read owned browser creations'));
  assert.deepEqual(ownedRows(), [], 'synthetic creation marker must start unused');
  const existingIds = new Set(JSON.parse(local.sql(
    "SELECT coalesce(jsonb_agg(id),'[]'::jsonb) FROM public.object WHERE id ~ '^HOTRUN[A-Z0-9]{10}$'",
    'capture existing generated IDs in the disposable stack')));

  const app = await startApp(local);
  let browser;
  let authorization;
  let createAttempt;
  let routeFailure;
  let closing = false;
  let retryRequested = false;
  let savedPatches = 0;
  const publications = [];
  const state = () => JSON.parse(local.sql(
    `SELECT jsonb_build_array(name,status,published_at IS NOT NULL)
       FROM public.object WHERE id='${objectId}' AND created_by='${writerId}'`,
    'read the newly created canonical fiche'));
  const draftAfterSave = [savedName, 'draft', false];

  async function assertBrowserWriter(request, schema) {
    const headers = await request.allHeaders();
    assert.ok(authorization && headers.authorization === authorization
      && headers.apikey === local.anonymous.apikey, 'expected the browser-issued GoTrue JWT and public key');
    if (schema) assert.equal(headers['content-profile'], schema);
  }

  async function checkCreation(response) {
    assert.equal(response.status(), 200, 'real create RPC must succeed');
    const id = await response.json();
    assert.ok(typeof id === 'string' && generatedHotId.test(id) && !existingIds.has(id),
      'expected a new server-generated HOT identifier');
    assert.deepEqual(ownedRows(), [id], 'the create RPC must commit exactly one new marked fiche');
    objectId = id;

    const browserHeaders = { ...local.anonymous, authorization };
    const user = await local.request('/auth/v1/user', browserHeaders, undefined, 'GET');
    assert.ok(user.ok && (await user.json()).id === writerId, 'GoTrue must verify the browser identity');
    const read = await local.request(
      `/rest/v1/object?select=id,name,object_type,status,published_at&id=eq.${id}`, browserHeaders, undefined, 'GET');
    assert.equal(read.status, 200, 'new draft must be visible to its actual author');
    assert.deepEqual(await read.json(), [{
      id, name: initialName, object_type: 'HOT', status: 'draft', published_at: null,
    }]);
    assert.equal(local.sql(`SELECT count(*) FROM public.object_org_link l
      JOIN public.ref_org_role r ON r.id=l.role_id
      WHERE l.object_id='${id}' AND l.org_object_id='ORGRUN999999AR01' AND r.code='publisher'`,
    'read new draft publisher link'), '1');

    // Supply only the mandatory publication fields before the browser opens its new editor.
    commit(`INSERT INTO public.object_location(object_id,city,is_main_location) VALUES ('${id}','Saint-Denis',true);
      INSERT INTO public.object_description(object_id,description,description_chapo,visibility)
        VALUES ('${id}','Synthetic editorial description','Synthetic introduction','public')`,
    'prepare the new draft publication prerequisites');
  }

  try {
    await waitForApp(app);
    browser = await launchOwnedBrowser(app, local);
    const context = await browser.newContext();
    const explorer = app.origin + '/explorer';
    const loginUrl = app.origin + '/login?from=' + encodeURIComponent('/explorer');
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!browser.permitted.has(url.origin)) return route.abort().catch(() => {});
      const localApi = url.origin === local.origin;
      const method = request.method();
      const path = url.pathname;
      const login = localApi && method === 'POST' && path === '/auth/v1/token'
        && url.searchParams.get('grant_type') === 'password';
      const create = localApi && method === 'POST' && path === '/rest/v1/rpc/rpc_create_object';
      const patch = localApi && method === 'PATCH' && path === '/rest/v1/object';
      const publish = localApi && method === 'POST' && path === '/rest/v1/rpc/rpc_publish_object';
      const directInsert = localApi && method === 'POST' && path === '/rest/v1/object';
      try {
        if (url.origin === app.origin && method === 'GET' && path === '/login') {
          assert.ok(!url.searchParams.has('email') && !url.searchParams.has('password'), 'credentials must stay out of the login URL');
        }
        assert.ok(!directInsert, 'creation must use the product RPC');
        if (create) {
          await assertBrowserWriter(request, 'api');
          assert.deepEqual(request.postDataJSON(), { p_object_type: 'HOT', p_name: initialName, p_region_code: 'RUN' });
          assert.ok(!createAttempt, 'one creation request per gesture');
          createAttempt = (async () => {
            const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
            await checkCreation(response);
            await route.fulfill({ response });
          })();
          await createAttempt;
          return;
        }
        if (patch) {
          await assertBrowserWriter(request);
          assert.ok(objectId && url.searchParams.get('id') === 'eq.' + objectId, 'save must target the new fiche');
          assert.equal(request.postDataJSON()?.name, savedName);
        }
        if (publish) {
          await assertBrowserWriter(request, 'api');
          assert.ok(objectId, 'publication needs a confirmed creation');
          assert.deepEqual(request.postDataJSON(), { p_object_id: objectId, p_publish: true });
          assert.ok(savedPatches > 0, 'a real save must finish before publication');
          assert.deepEqual(state(), draftAfterSave, 'saved content and draft state must be committed before publication');
          if (publications.length === 0) {
            publications.push('synthetic-503');
            return await route.fulfill({
              status: 503,
              headers: { 'access-control-allow-origin': app.origin },
              json: { code: 'FQ_CREATE_PUBLISH', message: 'Synthetic first publication outage' },
            });
          }
          assert.ok(retryRequested, 'only the explicit retry may reach PostgREST');
          assert.deepEqual(publications, ['synthetic-503']);
          publications.push('forwarded');
        }

        const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
        assert.ok(response.status() < 300 || response.status() >= 400, 'unexpected redirect');
        if (login) {
          assert.equal(response.status(), 200);
          const session = await response.json();
          assert.ok(!authorization && typeof session.access_token === 'string' && session.user?.id === writerId,
            'the browser login must return the expected synthetic session');
          authorization = 'Bearer ' + session.access_token;
        }
        if (patch) {
          assert.ok(response.ok(), 'canonical save failed');
          savedPatches++;
        }
        if (publish) {
          assert.ok(response.ok(), 'real publication retry failed');
          publications.push('committed');
        }
        await route.fulfill({ response });
      } catch {
        if (!closing && (login || create || patch || publish || directInsert || path === '/login')) {
          routeFailure ??= new Error('Owned create/publish request failed at ' + path);
        }
        await route.abort().catch(() => {});
      }
    });

    const page = await context.newPage();
    const login = await page.goto(loginUrl);
    assert.ok(login?.status() === 200 && login.url() === loginUrl, 'the real login document must open');
    await signIn(page, { email, password }, explorer);

    await page.getByRole('button', { name: 'Créer une fiche', exact: true }).click();
    const createDialog = page.getByRole('dialog', { name: 'Créer une fiche' });
    await createDialog.getByLabel('Nom de la fiche', { exact: true }).fill(initialName);
    await createDialog.getByRole('button', { name: 'Hôtellerie', exact: true }).click();
    await createDialog.getByRole('button', { name: 'Hôtel', exact: true }).click();
    await createDialog.getByRole('button', { name: 'Créer la fiche', exact: true }).click();
    await page.waitForURL((url) => Boolean(objectId) && url.origin === app.origin
      && url.pathname === '/objects/' + objectId + '/edit', { timeout: 60_000 });

    const name = page.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
    const publish = page.locator('.edit-top__right').getByRole('button', { name: 'Publier', exact: true });
    await expectUI(name).toHaveValue(initialName);
    assert.deepEqual(state(), [initialName, 'draft', false]);

    await name.fill(savedName);
    await publish.click();
    const failure = page.getByRole('dialog', { name: 'Enregistrement incomplet' });
    await expectUI(failure.getByText('Impossible de publier cette fiche.', { exact: true })).toBeVisible();
    assert.deepEqual(publications, ['synthetic-503']);
    assert.deepEqual(state(), draftAfterSave);
    await failure.locator('button.btn.primary').click();
    await expectUI(name).toHaveValue(savedName);

    retryRequested = true;
    await publish.click();
    await Promise.all([
      expectUI.poll(state).toEqual([savedName, 'published', true]),
      expectUI(page.getByText('Fiche enregistrée et publiée', { exact: true })).toBeVisible(),
    ]);
    assert.deepEqual(publications, ['synthetic-503', 'forwarded', 'committed']);
    assert.deepEqual(ownedRows(), [objectId], 'publication must preserve the exact new fiche');
    assert.equal(routeFailure, undefined);
  } catch (error) {
    throw routeFailure ?? error;
  } finally {
    closing = true;
    try {
      await createAttempt?.catch(() => {});
      await browser?.close();
    } finally {
      try {
        await stopApp(app);
      } finally {
        const ids = ownedRows();
        assert.ok(ids.length <= 1 && ids.every((id) => generatedHotId.test(id))
          && (!objectId || ids.length === 0 || ids[0] === objectId), 'cleanup requires the exact owned creation marker');
        if (ids.length === 1) {
          commit(`DELETE FROM public.object WHERE id='${ids[0]}' AND ${owned()}`, 'remove the owned browser creation');
        }
        assert.deepEqual(ownedRows(), [], 'the synthetic fiche must be removed');
      }
    }
  }
}
