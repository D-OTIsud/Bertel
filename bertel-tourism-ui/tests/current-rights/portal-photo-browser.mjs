import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import test from 'node:test';
import { expect } from '@playwright/test';
import sharp from 'sharp';
import { loadListEmailDisposable } from '../../../tools/list-email/disposable.mjs';
import { launchOwnedBrowser, startApp, stopApp, waitForApp } from './editor-races.mjs';

const objectId = 'HOTRUN999999PP01';
const objectName = 'Fiche fictive dépôt photo';
const orgId = 'ORGRUN999999PP01';
const orgName = 'Office fictif validation photo';
const fileName = 'photo-temoin.png';
const bucket = 'actor-documents';
const uploadRoute = '/api/portal-photo/upload';
const approvalRoute = '/api/portal-photo/approve';
const workspaceRoute = '/rest/v1/rpc/get_my_portal_photo_workspace';
const publicObject = '/storage/v1/object/public/media/';
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const expectUI = expect.configure({ timeout: 20_000 });
const writes = 'internal.portal_photo_actor_writes_enabled()';
const reservation = 'api.reserve_portal_photo_upload(text,uuid,uuid)';
const texts = 'api.update_portal_photo_proposal_texts(text,uuid,jsonb,text,text)';
const completion = 'api.complete_portal_photo_upload(uuid,uuid,text,text,integer,integer)';
const genericSender = 'api.send_portal_message(text,text,text,jsonb,text,uuid)';
const changeGate = (open) => `
  CREATE OR REPLACE FUNCTION ${writes} RETURNS boolean
  LANGUAGE sql STABLE SECURITY INVOKER SET search_path=pg_catalog AS $fn$
 SELECT ${open};
$fn$;
  ${open ? 'GRANT' : 'REVOKE'} EXECUTE ON FUNCTION ${reservation}, ${texts}
  ${open ? 'TO' : 'FROM'} authenticated;
  ${open ? 'GRANT' : 'REVOKE'} EXECUTE ON FUNCTION ${completion}
  ${open ? 'TO' : 'FROM'} service_role;
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
      const paths = new Map([['/login', 'login'], ['/espace', 'portal-home'], [expected.pathname, 'fixture-page']]);
      const stage = current.href === expected.href ? 'expected-url'
        : current.origin === expected.origin ? paths.get(current.pathname) ?? 'other-local' : 'off-origin';
      throw new Error('GoTrue accepted the password but the fixture page did not open (' +
        stage + '; bootstrap statuses ' + JSON.stringify(observed) + ')');
    }
  } finally {
    page.off('response', record);
  }
}

async function withOwnedBrowser(local, run) {
  const app = await startApp(local, { signDocuments: true });
  let browser;
  try {
    await waitForApp(app);
    browser = await launchOwnedBrowser(app, local);
    const newPage = async () => {
      const context = await browser.newContext();
      await context.route('**/*', (route) => {
        const url = new URL(route.request().url());
        const nativeCredentialGet = url.origin === app.origin && url.pathname === '/login'
          && route.request().method() === 'GET' && (url.searchParams.has('email') || url.searchParams.has('password'));
        return browser.permitted.has(url.origin) && !nativeCredentialGet ? route.continue() : route.abort();
      });
      return context.newPage();
    };
    await run(app.origin, newPage);
  } finally {
    try { await browser?.close(); }
    finally { await stopApp(app); }
  }
}

async function verifyBrowserIdentity(local, response, expectedId) {
  const authorization = await response.request().headerValue('authorization');
  assert.ok(authorization?.startsWith('Bearer '), 'the action must carry its browser JWT');
  const user = await local.request('/auth/v1/user', { ...local.anonymous, authorization }, undefined, 'GET');
  assert.ok(user.ok && (await user.json()).id === expectedId, 'GoTrue must verify the expected fixture identity');
  return authorization;
}

const photoDestination = '/espace/fiches/' + objectId + '?rubrique=photos';

async function uploadFromBrowser(page, appOrigin, local, { userId, actorId, email, password, png }) {
  await page.goto(appOrigin + '/login?from=' + encodeURIComponent(photoDestination));
  await signIn(page, email, password, appOrigin + photoDestination, local.origin);
  const add = page.getByRole('button', { name: 'Ajouter', exact: true });
  await expectUI(add).toBeEnabled();
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), add.click()]);
  await chooser.setFiles({ name: fileName, mimeType: 'image/png', buffer: png });
  const dialog = page.getByRole('dialog', { name: 'Préparer vos photos' });
  await expectUI(dialog).toBeVisible();
  await dialog.getByRole('checkbox', { name: /leur auteur m’autorise à les diffuser/ }).check();
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === appOrigin + uploadRoute && value.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Valider les ajouts', exact: true }).click(),
  ]);
  if (response.status() !== 201) {
    const error = await response.json().catch(() => null);
    let checkpoint = 'unavailable';
    try {
      checkpoint = local.sql(`SELECT jsonb_build_object(
        'reserved',(SELECT count(*) FROM public.actor_document a JOIN public.ref_document d ON d.id=a.document_id
          WHERE a.actor_id='${actorId}' AND a.created_by='${userId}'
            AND d.extra @> '{"source":"portal_photo","object_id":"${objectId}"}'::jsonb),
        'stored',(SELECT count(*) FROM storage.objects WHERE bucket_id='${bucket}'
          AND starts_with(name,'portal-photos/${actorId}/')))`);
    } catch { /* The HTTP refusal is still the primary failure. */ }
    assert.fail(`The fresh photo returned HTTP ${response.status()} (${error?.error === 'forbidden' ? 'forbidden' : 'other'}); fixture checkpoint ${checkpoint}`);
  }
  const contentType = await response.request().headerValue('content-type');
  assert.ok(contentType?.startsWith('multipart/form-data; boundary='), 'the browser sent a real multipart upload');
  await verifyBrowserIdentity(local, response, userId);
  const receipt = await response.json();
  assert.ok(uuid.test(receipt.id) && receipt.title === fileName && receipt.width === 8 && receipt.height === 6,
    'the route must return the fixture photo and its decoded dimensions');
  await expectUI(dialog).toBeHidden();
  await page.waitForURL(appOrigin + '/espace/fiches/' + objectId);
  return receipt.id;
}

async function submitFromBrowser(page, local, userId, documentId) {
  await page.getByRole('button', { name: 'Envoyer à l’office', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Envoyer à l’office' });
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === local.origin + '/rest/v1/rpc/submit_actor_fiche'
      && value.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Envoyer', exact: true }).click(),
  ]);
  assert.equal(response.status(), 200, 'the ACC08 photo envelope must be accepted');
  await verifyBrowserIdentity(local, response, userId);
  const envelope = response.request().postDataJSON();
  assert.equal(envelope.p_object_id, objectId);
  assert.equal(envelope.p_changes.length, 1);
  const [change] = envelope.p_changes;
  assert.equal(change.target_table, 'media');
  assert.equal(change.action, 'update');
  assert.equal(change.target_pk, null);
  assert.equal(change.metadata.rpc, 'publish_portal_photo_additions');
  assert.equal(change.metadata.section, 'media');
  assert.deepEqual(change.payload.additions.map((photo) => photo.upload_id), [documentId]);
  const result = await response.json();
  assert.ok(uuid.test(result.submission_id) && result.change_count === 1, 'one real photo proposal must be submitted');
  await expectUI(dialog).toBeHidden();
  return result.submission_id;
}

async function approveFromBrowser(page, appOrigin, local, office, submissionId) {
  const destination = '/moderation?object=' + objectId;
  await page.goto(appOrigin + '/login?from=' + encodeURIComponent(destination));
  await signIn(page, office.email, office.password, appOrigin + destination, local.origin);
  const submission = page.locator('section.mod-submission').filter({ hasText: objectName });
  await expectUI(submission).toHaveCount(1);
  await submission.getByRole('button', { name: 'Tout approuver', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Approuver l’envoi' });
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === appOrigin + approvalRoute && value.request().method() === 'POST'),
    dialog.getByRole('button', { name: 'Approuver', exact: true }).click(),
  ]);
  assert.deepEqual(response.request().postDataJSON(), { id: submissionId, batch: true, reviewNote: null, manual: false });
  await verifyBrowserIdentity(local, response, office.userId);
  assert.equal(response.status(), 200, 'the fixture publisher moderator must approve the photo');
  const result = await response.json();
  assert.equal(result.submission_status, 'approved');
  assert.equal(result.applied_count, 1);
  await expectUI(dialog).toBeHidden();
}

function readPublished(local, documentId) {
  return JSON.parse(local.sql(`SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'mediaId',m.id,'url',m.url,'main',m.is_main,'width',m.width,'height',m.height,
      'published',m.is_published,'visibility',m.visibility,'root',m.place_id IS NULL,
      'linked',d.extra->>'published_media_id'=m.id::text,'state',d.extra->>'slot_state'
    )),'[]') FROM public.media m JOIN public.ref_document d ON d.id='${documentId}'
    WHERE m.object_id='${objectId}' AND m.extra->>'portal_document_id'=d.id::text`));
}

function exactPublicKey(url, origin, documentId) {
  const prefix = origin + publicObject + 'portal-approved/' + documentId + '/';
  assert.ok(typeof url === 'string' && url.startsWith(prefix) && url.endsWith('.jpg')
    && uuid.test(url.slice(prefix.length, -4)), 'the persisted URL must use the exact owned document/claim key');
  return url.slice((origin + publicObject).length);
}

async function rereadFromBrowser(page, appOrigin, local, userId, documentId, media) {
  const [response] = await Promise.all([
    page.waitForResponse((value) => value.url() === local.origin + workspaceRoute
      && value.request().method() === 'POST' && value.request().postDataJSON().p_object_id === objectId),
    page.goto(appOrigin + photoDestination),
  ]);
  assert.equal(response.status(), 200, 'the same partner must still be able to read after closure');
  await verifyBrowserIdentity(local, response, userId);
  const workspace = await response.json();
  assert.equal(workspace.writesEnabled, false);
  assert.equal(workspace.analysisEnabled, false);
  assert.deepEqual(workspace.published.map(({ id, url, portalDocumentId }) => ({ id, url, portalDocumentId })), [
    { id: media.mediaId, url: media.url, portalDocumentId: documentId },
  ]);
  assert.deepEqual(workspace.proposals, [], 'the consumed receipt must leave the proposal list');
  await expectUI(page.getByText('La galerie est actuellement en consultation.', { exact: true })).toBeVisible();
  const image = page.getByRole('img', { name: fileName, exact: true });
  await expectUI(image).toHaveAttribute('src', media.url);
  await image.scrollIntoViewIfNeeded();
  await expectUI.poll(() => image.evaluate((element) => element.naturalWidth)).toBe(8);
}

test('real prestataire photo becomes public through authorized moderation', { timeout: 270_000 }, async (t) => {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_PORTAL_PHOTO_BROWSER === 'true',
    'the photo browser witness requires the explicit disposable Linux CI selector');
  const local = await loadListEmailDisposable();
  const userId = randomUUID(), actorId = randomUUID();
  const email = `portal-photo-${userId}@example.invalid`;
  const password = `Disposable!7-${randomUUID()}`;
  const office = { userId: randomUUID(), password: `Disposable!7-${randomUUID()}` };
  office.email = `photo-office-${office.userId}@example.invalid`;
  const prefix = `portal-photos/${actorId}/`;
  const keys = () => JSON.parse(local.sql(`SELECT coalesce(jsonb_agg(name),'[]') FROM storage.objects
    WHERE bucket_id='${bucket}' AND starts_with(name,'${prefix}')`));
  const approvedKeys = (documentId) => JSON.parse(local.sql(`SELECT coalesce(jsonb_agg(name),'[]') FROM storage.objects
    WHERE bucket_id='media' AND starts_with(name,'portal-approved/${documentId}/')`));
  const closed = () => local.sql(`SELECT NOT ${writes}
    AND NOT has_function_privilege('authenticated','${reservation}','EXECUTE')
    AND NOT has_function_privilege('authenticated','${texts}','EXECUTE')
    AND NOT has_function_privilege('authenticated','${completion}','EXECUTE')
    AND NOT has_function_privilege('service_role','${completion}','EXECUTE')
    AND NOT EXISTS(SELECT 1 FROM unnest(ARRAY['anon','authenticated','service_role']) AS role_name
      WHERE has_function_privilege(role_name::name,'${genericSender}','EXECUTE'))`);
  assert.equal(closed(), 't', 'photo writes must start closed on the fresh stack');
  assert.equal(local.sql(`SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='${bucket}' AND public IS FALSE)
    AND EXISTS(SELECT 1 FROM storage.buckets WHERE id='media' AND public IS TRUE)
    AND EXISTS(SELECT 1 FROM internal.portal_photo_analysis_settings WHERE singleton AND enabled IS FALSE)
    AND NOT EXISTS(SELECT 1 FROM public.app_ai_provider_config WHERE is_active)
    AND NOT EXISTS(SELECT 1 FROM public.app_smtp_config WHERE enabled)
    AND NOT EXISTS(SELECT 1 FROM public.object WHERE id IN ('${objectId}','${orgId}'))
    AND NOT EXISTS(SELECT 1 FROM public.actor WHERE id='${actorId}')
    AND EXISTS(SELECT 1 FROM public.ref_actor_role WHERE code='operator')
    AND EXISTS(SELECT 1 FROM public.ref_org_role WHERE code='publisher')
    AND EXISTS(SELECT 1 FROM public.ref_permission WHERE code='validate_changes' AND is_active)
    AND NOT EXISTS(SELECT 1 FROM auth.users
      WHERE id IN ('${userId}','${office.userId}') OR email IN ('${email}','${office.email}'))`), 't',
  'unused fixtures, the expected bucket visibility, and no active AI or SMTP are required');
  assert.deepEqual(keys(), []);
  const png = await sharp({ create: { width: 8, height: 6, channels: 3, background: '#c2305b' } }).png().toBuffer();
  let fixtureCreated = false, writesOpened = false, witnessFailed = false, documentId;
  const authAttempted = [];
  try {
    runFixture(local, `INSERT INTO public.actor(id,display_name) VALUES('${actorId}','Prestataire photo fictif');
      INSERT INTO public.object(id,object_type,name,status) VALUES
        ('${objectId}','HOT','${objectName}','published'),('${orgId}','ORG','${orgName}','published');
      INSERT INTO public.actor_object_role(actor_id,object_id,role_id,is_primary,visibility)
      SELECT '${actorId}','${objectId}',id,true,'public' FROM public.ref_actor_role WHERE code='operator' LIMIT 1;
      INSERT INTO public.object_org_link(object_id,org_object_id,role_id,is_primary)
      SELECT '${objectId}','${orgId}',id,true FROM public.ref_org_role WHERE code='publisher';`);
    fixtureCreated = true;
    for (const account of [{ userId, email, password, role: 'actor' }, { ...office, role: 'tourism_agent' }]) {
      authAttempted.push(account);
      const response = await local.request('/auth/v1/admin/users', local.service, {
        id: account.userId, email: account.email, password: account.password, email_confirm: true,
        app_metadata: { role: account.role, ...(account.role === 'actor' ? { actor_id: actorId } : {}) },
      });
      assert.ok(response.ok, 'fixture GoTrue account creation failed');
      const created = await response.json();
      assert.ok(created.id === account.userId && created.email === account.email && created.email_confirmed_at,
        'the fixture account must be confirmed without email');
    }
    runFixture(local, `INSERT INTO public.app_user_profile(id,role,actor_id) VALUES('${userId}','actor','${actorId}')
      ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
      INSERT INTO public.app_user_profile(id,role,actor_id) VALUES('${office.userId}','tourism_agent',NULL)
      ON CONFLICT(id) DO UPDATE SET role=EXCLUDED.role,actor_id=EXCLUDED.actor_id;
      INSERT INTO public.user_org_membership(user_id,org_object_id,is_active) VALUES('${office.userId}','${orgId}',true);
      INSERT INTO public.user_permission(user_id,permission_id,is_active,granted_by,granted_at,created_at,updated_at)
      SELECT '${office.userId}',id,true,'${office.userId}',now(),now(),now()
      FROM public.ref_permission WHERE code='validate_changes' AND is_active;
      ${changeGate(true)}`);
    writesOpened = true;
    await withOwnedBrowser(local, async (appOrigin, newPage) => {
      const partnerPage = await newPage();
      documentId = await uploadFromBrowser(partnerPage, appOrigin, local, { userId, actorId, email, password, png });
      const key = prefix + documentId + '.jpg';
      assert.deepEqual(keys(), [key], 'one new Storage object must exist under the actor namespace');
      const sha = local.sql(`SELECT d.extra->>'upload_sha256' FROM public.ref_document d
        JOIN public.actor_document a ON a.document_id=d.id
        WHERE d.id='${documentId}' AND a.actor_id='${actorId}' AND a.created_by='${userId}'
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
      assert.deepEqual(readPublished(local, documentId), []);
      assert.deepEqual(approvedKeys(documentId), []);

      const submissionId = await submitFromBrowser(partnerPage, local, userId, documentId);
      const status = () => local.sql(`SELECT s.status||':'||p.status||':'||COALESCE(p.reviewed_by::text,'') FROM public.fiche_submission s
        JOIN public.pending_change p ON p.submission_id=s.id AND p.object_id=s.object_id
        WHERE s.id='${submissionId}' AND s.object_id='${objectId}' AND s.actor_id='${actorId}' AND s.submitted_by='${userId}'
          AND p.submitted_by='${userId}' AND p.metadata->>'rpc'='publish_portal_photo_additions'
          AND p.payload->'additions' @> '[{"upload_id":"${documentId}"}]'::jsonb`);
      assert.equal(status(), 'pending:pending:');
      assert.deepEqual(readPublished(local, documentId), [], 'submission alone must publish nothing');
      assert.deepEqual(approvedKeys(documentId), []);

      await approveFromBrowser(await newPage(), appOrigin, local, office, submissionId);
      assert.equal(status(), 'approved:applied:' + office.userId);
      const published = readPublished(local, documentId);
      assert.equal(published.length, 1);
      const [media] = published;
      assert.ok(uuid.test(media.mediaId) && media.main && media.width === 8 && media.height === 6
        && media.published && media.visibility === 'public' && media.root && media.linked && media.state === 'consumed',
      'the canonical root media and the consumed private receipt must reference each other');
      const publicKey = exactPublicKey(media.url, local.origin, documentId);
      assert.deepEqual(approvedKeys(documentId), [publicKey]);
      const publicBytes = await local.request(media.url, {}, undefined, 'GET');
      assert.ok(publicBytes.ok && publicBytes.headers.get('content-type')?.startsWith('image/jpeg'),
        'the exact persisted media URL must return the public JPEG without authorization');
      assert.equal(createHash('sha256').update(Buffer.from(await publicBytes.arrayBuffer())).digest('hex'), sha,
        'the public JPEG must match the private receipt bytes');
      assert.deepEqual(keys(), [key], 'approval must preserve the original in private Storage');
      const privateAsPublic = await local.request(`/storage/v1/object/public/${bucket}/${key}`, {}, undefined, 'GET');
      assert.ok([400, 401, 403, 404].includes(privateAsPublic.status), 'the original must remain inaccessible without authorization');
      await privateAsPublic.body?.cancel();

      runFixture(local, changeGate(false));
      assert.equal(closed(), 't', 'fixture write grants must be closed before partner reread');
      writesOpened = false;
      await rereadFromBrowser(partnerPage, appOrigin, local, userId, documentId, media);
    });
  } catch (error) {
    witnessFailed = true;
    throw error;
  } finally {
    let cleanupOk = true;
    if (writesOpened) {
      try { runFixture(local, changeGate(false)); cleanupOk = closed() === 't'; }
      catch { cleanupOk = false; }
    }
    if (fixtureCreated) {
      let publishedKeys = [];
      if (documentId) {
        try {
          publishedKeys = readPublished(local, documentId).map((row) => exactPublicKey(row.url, local.origin, documentId));
          assert.ok(publishedKeys.length <= 1);
          assert.deepEqual(approvedKeys(documentId), publishedKeys,
            'cleanup may remove only the public key referenced by the fixture media');
        } catch { cleanupOk = false; publishedKeys = []; }
      }
      try {
        runFixture(local, `${documentId ? `DELETE FROM public.media WHERE object_id='${objectId}'
          AND extra->>'portal_document_id'='${documentId}';` : ''}
          DELETE FROM public.pending_change WHERE object_id='${objectId}' AND submitted_by='${userId}';
          DELETE FROM public.fiche_submission WHERE object_id='${objectId}' AND actor_id='${actorId}' AND submitted_by='${userId}';
          DELETE FROM public.crm_task WHERE object_id='${objectId}' AND actor_id='${actorId}' AND created_by='${userId}'
            AND extra->>'kind'='fiche_verification';
          DELETE FROM public.actor_document WHERE actor_id='${actorId}';
          DELETE FROM public.ref_document WHERE storage_bucket='${bucket}' AND starts_with(storage_path,'${prefix}')
            AND extra @> '{"source":"portal_photo","object_id":"${objectId}"}'::jsonb;
          DELETE FROM public.app_user_profile WHERE id='${userId}' AND actor_id='${actorId}';
          DELETE FROM public.user_permission WHERE user_id='${office.userId}';
          DELETE FROM public.user_org_membership WHERE user_id='${office.userId}' AND org_object_id='${orgId}';
          DELETE FROM public.app_user_profile WHERE id='${office.userId}' AND role='tourism_agent';
          DELETE FROM public.actor_object_role WHERE actor_id='${actorId}' AND object_id='${objectId}';
          DELETE FROM public.object_org_link WHERE object_id='${objectId}' AND org_object_id='${orgId}';
          DELETE FROM public.object WHERE id='${objectId}' AND name='${objectName}';
          DELETE FROM public.object WHERE id='${orgId}' AND name='${orgName}';
          DELETE FROM public.actor WHERE id='${actorId}';`);
        assert.equal(local.sql(`SELECT NOT EXISTS(SELECT 1 FROM public.object WHERE id IN ('${objectId}','${orgId}'))
          AND NOT EXISTS(SELECT 1 FROM public.actor WHERE id='${actorId}')
          AND NOT EXISTS(SELECT 1 FROM public.ref_document
            WHERE storage_bucket='${bucket}' AND starts_with(storage_path,'${prefix}'))`), 't');
        if (publishedKeys.length) {
          const removed = await local.request('/storage/v1/object/media', local.service, { prefixes: publishedKeys }, 'DELETE');
          assert.ok(removed.ok && approvedKeys(documentId).length === 0, 'fixture public photo cleanup failed');
        }
        const paths = keys();
        assert.ok(paths.length <= 1 && paths.every((key) => key.startsWith(prefix)
          && key.endsWith('.jpg') && uuid.test(key.slice(prefix.length, -4))), 'cleanup is limited to the owned fixture photo');
        if (paths.length) {
          const removed = await local.request(`/storage/v1/object/${bucket}`, local.service, { prefixes: paths }, 'DELETE');
          assert.ok(removed.ok && keys().length === 0, 'fixture photo cleanup failed');
        }
      } catch { cleanupOk = false; }
    }
    for (const account of authAttempted) {
      try {
        const owned = local.sql(`SELECT EXISTS(SELECT 1 FROM auth.users WHERE id='${account.userId}' AND email='${account.email}')`);
        if (owned === 't') {
          const removed = await local.request(`/auth/v1/admin/users/${account.userId}`, local.service, { should_soft_delete: false }, 'DELETE');
          assert.ok(removed.ok && local.sql(`SELECT NOT EXISTS(SELECT 1 FROM auth.users WHERE id='${account.userId}')`) === 't');
        }
      } catch { cleanupOk = false; }
    }
    if (!cleanupOk) {
      const message = 'synthetic fixture cleanup failed; destroy the disposable stack';
      if (witnessFailed) t.diagnostic(message);
      else assert.fail(message);
    }
  }
});
