import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { loadListEmailDisposable } from '../../../tools/list-email/disposable.mjs';
import { startApp, stopApp, waitForApp } from './editor-races.mjs';

const objectId = 'HOTRUN999999PP01';
const objectName = 'Fiche fictive dépôt photo';
const fileName = 'photo-temoin.png';
const bucket = 'actor-documents';
const uploadRoute = '/api/portal-photo/upload';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const expectUI = expect.configure({ timeout: 20_000 });
const writes = 'internal.portal_photo_actor_writes_enabled()';
const reservation = 'api.reserve_portal_photo_upload(text,uuid,uuid)';
const texts = 'api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)';
const changeGate = (open) => `
  CREATE OR REPLACE FUNCTION ${writes} RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT ${open};
$fn$;
  ${open ? 'GRANT' : 'REVOKE'} EXECUTE ON FUNCTION ${reservation}, ${texts}
  ${open ? 'TO' : 'FROM'} authenticated;
  NOTIFY pgrst, 'reload schema';`;
const runFixture = (local, sql) => local.sql(`BEGIN;
  SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
  ${sql}
  COMMIT;`);

async function signIn(page, email, password, target, authOrigin) {
  const recover = page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
  const back = page.getByRole('button', { name: 'Retour à la connexion', exact: true });
  const submit = page.getByRole('button', { name: 'Se connecter', exact: true });
  // Observe the same hydration barrier as the authenticated editor witness.
  await expectUI(async () => {
    if (!(await back.isVisible())) await recover.click({ timeout: 1000 });
    await expectUI(back).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await expectUI(async () => {
    if (!(await submit.isVisible())) await back.click({ timeout: 1000 });
    await expectUI(submit).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 20_000 });
  await page.getByLabel('Adresse e-mail').fill(email);
  await page.getByLabel('Mot de passe', { exact: true }).fill(password);
  const authPaths = new Map([
    ['/auth/v1/user', 'user'],
    ['/rest/v1/app_user_profile', 'profile'],
    ['/rest/v1/rpc/current_user_test_realm', 'realm'],
  ]);
  const observed = {};
  const record = (response) => {
    const url = new URL(response.url());
    const phase = url.origin === authOrigin && authPaths.get(url.pathname);
    if (phase) observed[phase] = response.status();
  };
  page.on('response', record);
  try {
    const tokenResponse = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.origin === authOrigin && url.pathname === '/auth/v1/token'
        && url.searchParams.get('grant_type') === 'password' && response.request().method() === 'POST';
    }, { timeout: 20_000 });
    const [token] = await Promise.all([tokenResponse, submit.click()]).catch(() => {
      throw new Error('The hydrated form did not reach the owned GoTrue password endpoint');
    });
    assert.equal(token.status(), 200, 'GoTrue must accept the browser password submission');
    try {
      await page.waitForURL(target, { timeout: 60_000, waitUntil: 'domcontentloaded' });
    } catch {
      const expected = new URL(target);
      const current = new URL(page.url());
      const paths = new Map([['/login', 'login'], ['/espace', 'portal-home'], [expected.pathname, 'fixture-fiche']]);
      const stage = current.href === expected.href ? 'expected-url'
        : current.origin === expected.origin ? paths.get(current.pathname) ?? 'other-local' : 'off-origin';
      throw new Error('GoTrue accepted the password but the photo rubric did not open (' +
        stage + '; bootstrap statuses ' + JSON.stringify(observed) + ')');
    }
  } finally {
    page.off('response', record);
  }
}

async function uploadFromBrowser(local, { userId, email, password, png }) {
  const app = await startApp(local, { signDocuments: true });
  const rejectProxy = createServer((_request, response) => response.writeHead(403, { Connection: 'close' }).end());
  rejectProxy.on('connect', (_request, socket) => socket.destroy());
  rejectProxy.on('upgrade', (_request, socket) => socket.destroy());
  let browser;
  try {
    await waitForApp(app);
    const permitted = new Set([app.origin, local.origin]);
    const exactHosts = Array.from(permitted, (origin) => {
      const url = new URL(origin);
      assert.ok(url.hostname === '127.0.0.1' && url.port, 'only the attested loopback origins are permitted');
      return url.host;
    });
    assert.equal(exactHosts.length, 2);
    rejectProxy.listen(0, '127.0.0.1');
    await once(rejectProxy, 'listening');
    browser = await chromium.launch({ env: app.safeEnv, args: [
      '--disable-background-networking',
      '--proxy-server=http://127.0.0.1:' + rejectProxy.address().port,
      '--proxy-bypass-list=<-loopback>;' + exactHosts.join(';'),
    ] });
    // The shipped CSP names hosted Supabase, while this witness uses a second
    // attested loopback origin. As in the editor witness, retain the rejecting
    // proxy and the exact origin allowlist for every browser request.
    const context = await browser.newContext({ bypassCSP: true, serviceWorkers: 'block' });
    await context.routeWebSocket('**/*', (route) => {
      const url = new URL(route.url());
      url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
      if (permitted.has(url.origin)) route.connectToServer();
      else route.close();
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      const nativeCredentialGet = url.origin === app.origin && url.pathname === '/login'
        && route.request().method() === 'GET' && (url.searchParams.has('email') || url.searchParams.has('password'));
      return permitted.has(url.origin) && !nativeCredentialGet ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    const destination = '/espace/fiches/' + objectId + '?rubrique=photos';
    await page.goto(app.origin + '/login?from=' + encodeURIComponent(destination));
    await signIn(page, email, password, app.origin + destination, local.origin);
    const add = page.getByRole('button', { name: 'Ajouter', exact: true });
    await expectUI(add).toBeEnabled();
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.click()]);
    await chooser.setFiles({ name: fileName, mimeType: 'image/png', buffer: png });
    const dialog = page.getByRole('dialog', { name: 'Préparer vos photos' });
    await expectUI(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /leur auteur m’autorise à les diffuser/ }).check();
    const [response] = await Promise.all([
      page.waitForResponse((value) => value.url() === app.origin + uploadRoute && value.request().method() === 'POST'),
      dialog.getByRole('button', { name: 'Valider les ajouts', exact: true }).click(),
    ]);
    assert.equal(response.status(), 201, 'the fresh photo must be persisted by the real Next route');
    const contentType = await response.request().headerValue('content-type');
    assert.ok(contentType?.startsWith('multipart/form-data; boundary='), 'the browser sent a real multipart upload');
    const authorization = await response.request().headerValue('authorization');
    assert.ok(authorization?.startsWith('Bearer '), 'the upload must carry the browser JWT');
    const user = await local.request('/auth/v1/user', { ...local.anonymous, authorization }, undefined, 'GET');
    assert.ok(user.ok && (await user.json()).id === userId, 'GoTrue independently verifies the browser upload identity');
    const receipt = await response.json();
    assert.ok(uuid.test(receipt.id) && receipt.title === fileName && receipt.width === 8 && receipt.height === 6,
      'the route must return the fixture photo and its decoded dimensions');
    await expectUI(dialog).toBeHidden();
    await page.waitForURL(app.origin + '/espace/fiches/' + objectId);
    return receipt.id;
  } finally {
    try { await browser?.close(); }
    finally {
      if (rejectProxy.listening) rejectProxy.close();
      await stopApp(app);
    }
  }
}

test('real prestataire browser deposits photo bytes in private Storage', { timeout: 240_000 }, async () => {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_PORTAL_PHOTO_BROWSER === 'true',
    'the photo browser witness requires the explicit disposable Linux CI selector');
  const local = await loadListEmailDisposable();
  const userId = randomUUID(), actorId = randomUUID();
  const email = `portal-photo-${userId}@example.invalid`;
  const password = `Disposable!7-${randomUUID()}`;
  const prefix = `portal-photos/${actorId}/`;
  const keys = () => JSON.parse(local.sql(`SELECT coalesce(jsonb_agg(name),'[]') FROM storage.objects
    WHERE bucket_id='${bucket}' AND starts_with(name,'${prefix}')`));
  const closed = () => local.sql(`SELECT NOT ${writes}
    AND NOT has_function_privilege('authenticated','${reservation}','EXECUTE')
    AND NOT has_function_privilege('authenticated','${texts}','EXECUTE')`);
  assert.equal(closed(), 't', 'photo writes must start closed on the fresh stack');
  assert.equal(local.sql(`SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='${bucket}' AND public IS FALSE)
    AND EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings WHERE singleton AND enabled IS FALSE)
    AND NOT EXISTS(SELECT 1 FROM public.object WHERE id='${objectId}')
    AND NOT EXISTS(SELECT 1 FROM public.actor WHERE id='${actorId}')
    AND EXISTS(SELECT 1 FROM public.ref_actor_role WHERE code='operator')
    AND NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${userId}' OR email='${email}')`), 't',
  'a private bucket, disabled AI and an unused fixture are required');
  assert.deepEqual(keys(), []);
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#c2305b' } }).png().toBuffer();
  let fixtureCreated = false, authAttempted = false, writesOpened = false;
  try {
    runFixture(local, `INSERT INTO public.actor(id,display_name) VALUES('${actorId}','Prestataire photo fictif');
      INSERT INTO public.object(id,object_type,name,status) VALUES('${objectId}','HOT','${objectName}','published');
      INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary,visibility)
      SELECT '${actorId}','${objectId}',id,true,'public' FROM public.ref_actor_role WHERE code='operator' LIMIT 1;`);
    fixtureCreated = true;
    authAttempted = true;
    const response = await local.request('/auth/v1/admin/users', local.service, {
      id: userId, email, password, email_confirm: true, app_metadata: { role: 'actor', actor_id: actorId },
    });
    assert.ok(response.ok, 'fixture GoTrue account creation failed');
    const created = await response.json();
    assert.ok(created.id === userId && created.email === email && created.email_confirmed_at,
      'the fixture account must be confirmed without email');
    runFixture(local, `INSERT INTO public.app_user_profile(id,role,actor_id) VALUES('${userId}','actor','${actorId}')
      ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
      ${changeGate(true)}`);
    writesOpened = true;
    const id = await uploadFromBrowser(local, { userId, email, password, png });
    const key = prefix + id + '.jpg';
    assert.deepEqual(keys(), [key], 'one new Storage object must exist under the actor namespace');
    const sha = local.sql(`SELECT d.extra->>'upload_sha256' FROM public.ref_document d
      JOIN public.actor_document a ON a.document_id=d.id
      WHERE d.id='${id}' AND a.actor_id='${actorId}' AND a.created_by='${userId}'
        AND d.storage_bucket='${bucket}' AND d.storage_path='${key}' AND d.access_scope='crm_private'
        AND d.extra @> '{"source":"portal_photo","object_id":"${objectId}","upload_complete":true,"slot_state":"uploaded","width":8,"height":6}'::jsonb`);
    assert.ok(/^[0-9a-f]{64}$/.test(sha), 'the durable completed private receipt must match the actor and photo');
    const stored = await local.request(`/storage/v1/object/authenticated/${bucket}/${key}`, local.service, undefined, 'GET');
    assert.ok(stored.ok && stored.headers.get('content-type')?.startsWith('image/jpeg'), 'Storage must return the processed JPEG bytes');
    const bytes = Buffer.from(await stored.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'), sha, 'independent Storage GET must match the receipt hash');
    const decoded = await sharp(bytes).metadata();
    assert.ok(decoded.format === 'jpeg' && decoded.width === 8 && decoded.height === 6);
    const pixel = await sharp(bytes).extract({ left: 3, top: 2, width: 1, height: 1 }).raw().toBuffer();
    const expectedPixel = [194, 48, 91];
    assert.ok(pixel.length === 3 && pixel.every((channel, index) => Math.abs(channel - expectedPixel[index]) <= 4),
      'the stored JPEG represents the distinctive input PNG');
  } finally {
    let cleanupOk = true;
    if (writesOpened) {
      try { runFixture(local, changeGate(false)); cleanupOk = closed() === 't'; }
      catch { cleanupOk = false; }
    }
    if (fixtureCreated) {
      try {
        const paths = keys();
        assert.ok(paths.length <= 1 && paths.every((key) => key.startsWith(prefix)
          && key.endsWith('.jpg') && uuid.test(key.slice(prefix.length, -4))), 'cleanup is limited to the owned fixture photo');
        if (paths.length) {
          const removed = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: paths }, 'DELETE');
          assert.ok(removed.ok && keys().length === 0, 'fixture photo cleanup failed');
        }
      } catch { cleanupOk = false; }
      try {
        runFixture(local, `DELETE FROM public.actor_document WHERE actor_id='${actorId}';
          DELETE FROM public.ref_document WHERE storage_bucket='${bucket}' AND starts_with(storage_path,'${prefix}')
            AND extra @> '{"source":"portal_photo","object_id":"${objectId}"}'::jsonb;
          DELETE FROM public.app_user_profile WHERE id='${userId}' AND actor_id='${actorId}';
          DELETE FROM public.actor_object_role WHERE actor_id='${actorId}' AND object_id='${objectId}';
          DELETE FROM public.object WHERE id='${objectId}' AND name='${objectName}';
          DELETE FROM public.actor WHERE id='${actorId}';`);
        assert.equal(local.sql(`SELECT NOT EXISTS(SELECT 1 FROM public.object WHERE id='${objectId}')
          AND NOT EXISTS(SELECT 1 FROM public.actor WHERE id='${actorId}')
          AND NOT EXISTS(SELECT 1 FROM public.ref_document
            WHERE storage_bucket='${bucket}' AND starts_with(storage_path,'${prefix}'))`), 't');
      } catch { cleanupOk = false; }
    }
    if (authAttempted) {
      try {
        const owned = local.sql(`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id='${userId}' AND email='${email}')`);
        if (owned === 't') {
          const removed = await local.request(`/auth/v1/admin/users/${userId}`, local.service, { should_soft_delete: false }, 'DELETE');
          assert.ok(removed.ok && local.sql(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${userId}')`) === 't');
        }
      } catch { cleanupOk = false; }
    }
    assert.ok(cleanupOk, 'synthetic fixture cleanup failed; destroy the disposable stack');
  }
});
