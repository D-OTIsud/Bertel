import assert from 'node:assert/strict';
import { expect } from '@playwright/test';
import { launchOwnedBrowser, startApp, stopApp, waitForApp } from './editor-races.mjs';

const expectUI = expect.configure({ timeout: 20_000 });
const probes = [
  'current_user_can_edit_objects', 'user_can_create_object', 'current_user_active_org',
  'current_user_admin_rank', 'current_user_admin_role_code', 'current_user_test_realm',
];
const createProbe = 'user_can_create_object';
const realmProbe = 'current_user_test_realm';
const portalFiches = 'list_my_portal_fiches';

async function signIn(page, account) {
  const forgot = page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
  const back = page.getByRole('button', { name: 'Retour à la connexion', exact: true });
  const submit = page.getByRole('button', { name: 'Se connecter', exact: true });
  await expectUI(async () => {
    if (!(await back.isVisible())) await forgot.click({ timeout: 1000 });
    await expectUI(back).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expectUI(async () => {
    if (!(await submit.isVisible())) await back.click({ timeout: 1000 });
    await expectUI(submit).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel('Adresse e-mail').fill(account.email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(account.password);
  await submit.click();
}

export async function testBootstrapFallbacks({ local, writer, partner, objectId }) {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_DISPOSABLE === 'true'
    && process.env.CURRENT_RIGHTS_EDITOR_BROWSER === 'true' && objectId === 'HOTRUN999999AR01',
  'owned disposable browser and fixture required');
  const app = await startApp(local);
  let owned;
  try {
    await waitForApp(app);
    owned = await launchOwnedBrowser(app, local);
    for (const { mode, account, path } of [
      { mode: 'writer', account: writer, path: '/explorer' },
      { mode: 'partial', account: writer, path: '/explorer' },
      { mode: 'partner', account: partner, path: '/espace' },
    ]) {
      const context = await owned.newContext();
      const trace = [];
      let authorization;
      let failure;
      try {
        await context.route('**/*', async (route) => {
          const request = route.request();
          const url = new URL(request.url());
          if (!owned.permitted.has(url.origin)) return route.abort('blockedbyclient');
          const localPost = url.origin === local.origin && request.method() === 'POST';
          const token = localPost && url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password';
          const rpc = localPost && url.pathname.startsWith('/rest/v1/rpc/') ? url.pathname.split('/').at(-1) : null;
          if (!token && !probes.includes(rpc) && rpc !== portalFiches) return route.continue();
          try {
            if (!token) {
              const headers = await request.allHeaders();
              assert.ok(authorization && headers.authorization === authorization
                && headers.apikey === local.anonymous.apikey && headers['content-profile'] === 'api',
              'each bootstrap call must carry the same synthetic GoTrue session and the anon key');
            }
            const started = performance.now();
            const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 15_000 });
            assert.equal(response.status(), 200, 'the unmodified upstream response must succeed');
            if (token) {
              const body = await response.json();
              assert.ok(typeof body.access_token === 'string' && body.user?.id === account.id,
                'GoTrue must return the exact fixture account');
              authorization = 'Bearer ' + body.access_token;
              return await route.fulfill({ response });
            }
            if (rpc === createProbe || rpc === probes[0]) {
              assert.equal(await response.json(), true, 'the writer must have the real capability before fault injection');
            } else if (rpc === portalFiches) {
              const rows = await response.json();
              assert.ok(Array.isArray(rows) && rows.some((row) => row.id === objectId),
                'the partner must receive its exact fixture');
            }
            const status = mode === 'partial' && rpc === createProbe ? 503 : 200;
            trace.push({ rpc, status, started, received: performance.now() });
            if (status === 503) {
              return await route.fulfill({ response, status, json: { code: 'SYNTHETIC_UNAVAILABLE', message: 'Disposable fault' } });
            }
            return await route.fulfill({ response });
          } catch {
            failure = mode + ': invalid ' + (token ? 'GoTrue session' : rpc) + ' witness';
            await route.abort('failed').catch(() => {});
          }
        });
        const page = await context.newPage();
        const target = app.origin + path;
        await page.goto(app.origin + '/login?from=' + encodeURIComponent(path));
        await signIn(page, account);
        await page.waitForURL(target, { timeout: 55_000 });
        if (mode === 'partner') {
          await expectUI(page.locator('a[href="/espace/fiches/' + objectId + '"]')).toBeVisible();
        } else {
          await expectUI(page.getByRole('link', { name: /^mod[eé]ration/i })).toBeVisible();
          const create = page.getByRole('button', { name: 'Créer une fiche', exact: true });
          if (mode === 'partial') await expectUI(create).toHaveCount(0);
          else await expectUI(create).toBeVisible();
        }
        assert.ok(!failure, failure);
        const expected = mode === 'partner' ? [realmProbe, portalFiches] : probes;
        assert.deepEqual(trace.map(({ rpc }) => rpc).sort(), [...expected].sort(),
          'all expected calls must be observed once, including the successful portal resource');
        assert.deepEqual(trace.filter(({ status }) => status === 503).map(({ rpc }) => rpc),
          mode === 'partial' ? [createProbe] : []);
        const first = Math.min(...trace.map(({ started }) => started));
        console.log(JSON.stringify({ witness: 'FQ03', mode, trace: trace.map(({ rpc, status, started, received }) =>
          ({ rpc, status, startMs: Math.round(started - first), responseMs: Math.round(received - first) })) }));
      } catch (error) {
        throw new Error('Bootstrap witness ' + mode + '; ' + (failure ?? 'browser assertion')
          + '; observed ' + trace.map(({ rpc }) => rpc).join(','), { cause: error });
      } finally {
        await context.close();
      }
    }
  } finally {
    try { await owned?.close(); }
    finally { await stopApp(app); }
  }
}
