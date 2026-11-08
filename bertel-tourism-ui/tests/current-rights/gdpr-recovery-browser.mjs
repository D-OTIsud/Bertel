// Browser-only recovery witness. Server/provider lost-ACK semantics are qualified separately
// by gdpr-cleanup-http.mjs; this scenario never creates a provider cleanup task.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect } from '@playwright/test';
import { startApp, waitForApp, stopApp, launchOwnedBrowser } from './editor-races.mjs';

const check = expect.configure({ timeout: 20_000 });
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;
const keyFor = (id) => `bertel-rgpd-start:v1:${encodeURIComponent(id)}`;
const hash = (value) => createHash('sha256').update(value).digest('hex');
const unknownTitle = 'Statut non confirmé';
const resumeName = 'Reprendre le nettoyage de cette opération';

async function bounded(promise, stage) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(stage)), 35_000); })]); }
  finally { clearTimeout(timer); }
}

function barrier() {
  let release;
  const promise = new Promise((done) => { release = done; });
  return { promise, release };
}

export async function testGdprRecoveryBrowser({ local, commit, writerId, email, password, secondAccount }) {
  assert.ok(process.platform === 'linux' && process.env.CURRENT_RIGHTS_GDPR_RECOVERY_BROWSER === 'true'
    && process.env.CURRENT_RIGHTS_GDPR_CLEANUP === 'true' && process.env.CURRENT_RIGHTS_DISPOSABLE === 'true'
    && /^http:\/\/127\.0\.0\.1:[0-9]+$/.test(local.origin)
    && writerId === '00000000-0000-4000-a000-00000000ae11'
    && secondAccount?.id === '00000000-0000-4000-a000-00000000ae12', 'owned two-account Linux GDPR fixture required');
  assert.ok(email && password && secondAccount.email && secondAccount.password, 'real fixture login credentials required');
  const subjects = [randomUUID(), randomUUID(), randomUUID()];
  const reason = 'SYNTHETIC-RECOVERY-MOTIF-NOT-STORED';
  const calls = [], scenes = [], errors = [];
  let app, browser, fixtureCreated = false;
  const priorRoles = JSON.parse(local.sql(`SELECT json_agg(json_build_array(id,role) ORDER BY id)
    FROM public.app_user_profile WHERE id IN ('${writerId}','${secondAccount.id}')`, 'ordinary owned GDPR browser profiles'));
  assert.deepEqual(priorRoles, [[writerId, 'tourism_agent'], [secondAccount.id, 'tourism_agent']]);
  const journalCount = (subject) => Number(local.sql(`SELECT count(*) FROM public.gdpr_erasure_log
    WHERE subject_kind='actor' AND subject_id='${subject}'`, 'count exact synthetic GDPR operation'));
  const noTasks = (operation) => local.sql(`SELECT count(*) FROM internal.gdpr_cleanup_task
    WHERE operation_id='${operation}'`, 'no provider task belongs to this browser-only fixture');
  try {
    commit(`INSERT INTO public.actor(id,display_name,is_test) VALUES
      ${subjects.map((id, i) => `('${id}','Synthetic recovery ${i}',false)`).join(',')};
      UPDATE public.app_user_profile SET role='super_admin' WHERE id IN ('${writerId}','${secondAccount.id}')`,
    'create only owned document-free recovery actors and two current fixture administrators');
    fixtureCreated = true;
    local.sqlFile(resolve('supabase/releases/20261108_gdpr_cleanup/activate.sql'), 'open exact reviewed capability only on the disposable stack');
    app = await startApp(local, { signDocuments: true });
    await waitForApp(app);
    browser = await launchOwnedBrowser(app, local);
    const destination = app.origin + '/rgpd';
    const loginUrl = app.origin + '/login?from=' + encodeURIComponent('/rgpd');

    async function openScene(subject, loss) {
      const context = await browser.newContext();
      const scene = { context, subject, loss, activeId: writerId, lost: false, operationId: null,
        holdLookup: false, lookupSeen: barrier(), releaseLookup: barrier(), lookupTerminal: barrier(), completedLookups: 0,
        holdResume: false, resumeSeen: barrier(), releaseResume: barrier(), resumeTerminal: barrier(), closing: false };
      scenes.push(scene);
      await context.addInitScript(() => {
        const original = Storage.prototype.setItem;
        window.__gdprRecoveryStorageFault = { deny: false, attempts: 0 };
        Storage.prototype.setItem = function (key, value) {
          if (this === window.localStorage && String(key).startsWith('bertel-rgpd-start:v1:')
            && window.__gdprRecoveryStorageFault.deny) {
            window.__gdprRecoveryStorageFault.attempts++;
            throw new DOMException('Synthetic scoped quota fault', 'QuotaExceededError');
          }
          return original.call(this, key, value);
        };
      });
      await context.route('**/*', async (route) => {
        const request = route.request();
        const url = new URL(request.url());
        if (!browser.permitted.has(url.origin)) return route.abort().catch(() => {});
        if (url.origin === app.origin && url.pathname === '/login' && request.method() === 'GET'
          && (url.searchParams.has('email') || url.searchParams.has('password'))) {
          errors.push('native_credential_query');
          return route.abort().catch(() => {});
        }
        if (url.origin !== app.origin || url.pathname !== '/api/rgpd/erase') return route.continue();
        try {
          assert.equal(request.method(), 'POST');
          const body = request.postDataJSON();
          const keys = Object.keys(body).sort();
          const kind = keys.length === 1 && keys[0] === 'requestId' ? 'lookup'
            : keys.length === 1 && keys[0] === 'operationId' ? 'resume'
              : keys.includes('requestId') && keys.includes('subjectId') ? 'start' : null;
          assert.ok(kind, 'exact START, lookup or RESUME body required');
          const authorization = (await request.allHeaders()).authorization;
          const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(authorization ?? '');
          assert.ok(token, 'real GoTrue browser authorization required');
          const claims = JSON.parse(Buffer.from(token[1].split('.')[1], 'base64url'));
          assert.ok(claims.sub === scene.activeId && claims.role === 'authenticated', 'dispatch must use the current fixture identity');
          calls.push({ scene, kind, userId: claims.sub, requestId: body.requestId, operationId: body.operationId });
          assert.equal(claims.sub, writerId, 'the second account must not consume the first account recovery reference');
          if (kind === 'start') {
            assert.equal(body.subjectKind, 'actor'); assert.equal(body.subjectId, subject);
            assert.equal(body.mode, 'anonymize'); assert.equal(body.reason, reason);
            assert.ok(uuid.test(body.requestId));
            assert.equal(calls.filter((c) => c.scene === scene && c.kind === 'start').length, 1, 'never replay START');
            const persisted = await scene.page.evaluate((key) => localStorage.getItem(key), keyFor(writerId));
            assert.ok(persisted, 'real browser persistence must precede the first START network request');
            const record = JSON.parse(persisted);
            assert.deepEqual(Object.keys(record).sort(), ['fingerprint', 'requestId', 'version']);
            assert.equal(record.version, 1); assert.equal(record.requestId, body.requestId);
            assert.equal(record.fingerprint, hash(JSON.stringify(['actor', subject, 'anonymize', reason])));
            assert.ok(!persisted.includes(reason) && !persisted.includes(subject) && !persisted.includes(token[1]), 'only the approved non-content reference may persist');
            scene.stored = persisted; scene.requestId = body.requestId;
            if (loss === 'before_dispatch') {
              scene.lost = true;
              return route.abort('failed');
            }
          }
          const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 45_000 });
          if (kind === 'start' && loss === 'after_commit' && !scene.lost) {
            const result = await response.json();
            assert.ok(response.ok() && uuid.test(result.operationId), 'real Next START must return its committed operation before ACK loss');
            scene.operationId = result.operationId;
            assert.equal(local.sql(`SELECT count(*) FROM public.gdpr_erasure_log WHERE id='${scene.operationId}'
              AND subject_kind='actor' AND subject_id='${subject}' AND performed_by='${writerId}'
              AND report->>'startRequestId'='${scene.requestId}'`, 'real committed browser START binding'), '1');
            assert.equal(noTasks(scene.operationId), '0', 'browser recovery fixture must admit no Storage/Auth provider effect');
            scene.lost = true;
            return route.fulfill({ status: 503, contentType: 'application/json', body: '{"error":"synthetic_committed_ack_lost"}' });
          }
          if (kind === 'lookup') {
            assert.equal(body.requestId, scene.requestId, 'lookup must use the actually persisted request identity');
            if (loss === 'before_dispatch') assert.equal(response.status(), 404, 'lookup absence must be a real server result');
            else {
              assert.equal(response.status(), 200);
              assert.deepEqual(await response.json(), { requestId: scene.requestId, operationId: scene.operationId });
            }
            if (scene.holdLookup) {
              scene.holdLookup = false; scene.heldRequest = request; scene.lookupSeen.release();
              await bounded(scene.releaseLookup.promise, 'owned lookup response was not released');
            }
          }
          if (kind === 'resume') {
            assert.equal(body.operationId, scene.operationId, 'resume must name only the recovered operation');
            const result = await response.json();
            assert.ok(response.status() === 200 && result.ok === true && result.status === 'completed'
              && result.operationId === scene.operationId && result.report.startRequestId === scene.requestId,
            'the real recovered operation must be confirmed completed before its browser ACK');
            if (scene.holdResume) {
              scene.holdResume = false; scene.heldResumeRequest = request; scene.resumeSeen.release();
              await bounded(scene.releaseResume.promise, 'owned completed RESUME response was not released');
            }
          }
          await route.fulfill({ response }).catch((error) => {
            // A deliberately held A request may have been aborted by the actual authority change.
            if (!scene.closing && !(kind === 'lookup' && scene.activeId !== writerId)) throw error;
          });
          if (kind === 'lookup') scene.completedLookups++;
        } catch {
          if (!scene.closing) errors.push('unexpected_recovery_browser_contract');
          await route.abort().catch(() => {});
        }
      });
      context.on('requestfinished', (request) => { if (request === scene.heldRequest) scene.lookupTerminal.release(); if (request === scene.heldResumeRequest) scene.resumeTerminal.release(); });
      context.on('requestfailed', (request) => { if (request === scene.heldRequest) scene.lookupTerminal.release(); if (request === scene.heldResumeRequest) scene.resumeTerminal.release(); });
      scene.page = await context.newPage();
      scene.page.on('pageerror', () => { if (!scene.closing) errors.push('recovery_page_error'); });
      return scene;
    }

    async function signIn(scene, id, credentials) {
      scene.activeId = id;
      await scene.page.goto(loginUrl);
      const forgot = scene.page.getByRole('button', { name: 'Mot de passe oublié ?', exact: true });
      const back = scene.page.getByRole('button', { name: 'Retour à la connexion', exact: true });
      await check(async () => {
        if (await back.isVisible()) return;
        await forgot.click({ timeout: 1000 }); await check(back).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: 20_000 });
      await back.click();
      await scene.page.getByLabel('Adresse e-mail').fill(credentials.email);
      await scene.page.getByLabel('Mot de passe', { exact: true }).fill(credentials.password);
      const signedIn = scene.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.origin === local.origin && url.pathname === '/auth/v1/token'
          && url.searchParams.get('grant_type') === 'password' && response.request().method() === 'POST';
      });
      void signedIn.catch(() => {});
      await scene.page.getByRole('button', { name: 'Se connecter', exact: true }).click();
      const accepted = await signedIn;
      assert.ok(accepted.ok(), 'the real fixture GoTrue login must succeed');
      const session = await accepted.json();
      assert.ok(session.user?.id === id && typeof session.access_token === 'string', 'GoTrue must return the exact current browser account');
      await check(scene.page).toHaveURL(destination, { timeout: 60_000 });
      await check(scene.page.getByRole('heading', { name: 'Effacement RGPD (Art. 17)', exact: true })).toBeVisible();
    }
    async function signOut(scene) {
      const profile = scene.page.getByRole('button', { name: /^Profil / });
      await profile.focus(); await scene.page.keyboard.press('Enter');
      const signedOut = scene.page.waitForResponse((response) => {
        const url = new URL(response.url());
        return url.origin === local.origin && url.pathname === '/auth/v1/logout' && response.request().method() === 'POST';
      });
      void signedOut.catch(() => {});
      await scene.page.getByRole('button', { name: 'Se déconnecter', exact: true }).click();
      assert.ok((await signedOut).ok(), 'real GoTrue must accept the account sign-out');
      await check(scene.page).toHaveURL(loginUrl);
    }
    async function startGesture(scene) {
      await scene.page.getByRole('button', { name: /Coller.*UUID/i }).click();
      await scene.page.getByLabel('Identifiant du sujet (UUID)', { exact: true }).fill(scene.subject);
      await scene.page.getByLabel('Motif / référence de la demande', { exact: true }).fill(reason);
      await scene.page.getByRole('button', { name: 'Anonymiser le sujet', exact: true }).click();
      await scene.page.getByRole('dialog').getByRole('button', { name: 'Anonymiser', exact: true }).click();
    }
    const stored = (scene, id) => scene.page.evaluate((key) => localStorage.getItem(key), keyFor(id));
    const sceneCalls = (scene, kind) => calls.filter((c) => c.scene === scene && (!kind || c.kind === kind));
    const accountA = { email, password };

    // 1. Actual persistence + native reload, then late A lookup while B is active.
    const recovery = await openScene(subjects[0], 'after_commit');
    await signIn(recovery, writerId, accountA);
    await startGesture(recovery);
    await check.poll(() => recovery.lost).toBe(true);
    await check(recovery.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    assert.equal(await stored(recovery, writerId), recovery.stored);
    await recovery.page.reload();
    await check(recovery.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    assert.equal(await stored(recovery, writerId), recovery.stored);
    await check(recovery.page.getByText(recovery.requestId, { exact: true })).toBeVisible();
    assert.equal(sceneCalls(recovery, 'start').length, 1);
    recovery.holdLookup = true;
    await recovery.page.getByRole('button', { name: resumeName, exact: true }).click();
    await check.poll(() => sceneCalls(recovery, 'lookup').length).toBe(1);
    await bounded(recovery.lookupSeen.promise, 'real A lookup did not complete before the account transition');
    await signOut(recovery);
    await signIn(recovery, secondAccount.id, secondAccount);
    await check(recovery.page.getByText(unknownTitle, { exact: true })).toHaveCount(0);
    await check(recovery.page.getByRole('button', { name: resumeName, exact: true })).toHaveCount(0);
    await check(recovery.page.getByText(recovery.requestId, { exact: true })).toHaveCount(0);
    assert.equal(await stored(recovery, writerId), recovery.stored);
    assert.equal(await stored(recovery, secondAccount.id), null);
    recovery.releaseLookup.release();
    await bounded(recovery.lookupTerminal.promise, 'held A request had no observed terminal browser event');
    await check.poll(() => recovery.completedLookups).toBe(1);
    // A positive current B frame is required; do not turn a permission-denied page into isolation proof.
    await check(recovery.page.getByRole('button', { name: 'Anonymiser le sujet', exact: true })).toBeVisible();
    await recovery.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(sceneCalls(recovery, 'resume').length, 0, 'late A lookup must not resume under B');
    await check(recovery.page.getByText(unknownTitle, { exact: true })).toHaveCount(0);
    await check(recovery.page.getByText(recovery.requestId, { exact: true })).toHaveCount(0);
    await signOut(recovery);
    await signIn(recovery, writerId, accountA);
    await check(recovery.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    recovery.holdResume = true;
    await recovery.page.getByRole('button', { name: resumeName, exact: true }).click();
    await bounded(recovery.resumeSeen.promise, 'real same-operation RESUME did not reach its committed completion');
    assert.equal(await stored(recovery, writerId), recovery.stored, 'never release the reference before the completed response reaches the browser');
    await check(recovery.page.getByRole('button', { name: 'Reprise en cours…', exact: true })).toBeDisabled();
    recovery.releaseResume.release();
    await bounded(recovery.resumeTerminal.promise, 'completed RESUME had no terminal browser event');
    await check.poll(() => sceneCalls(recovery, 'resume').length).toBe(1);
    await check.poll(() => stored(recovery, writerId)).toBe(null);
    assert.equal(sceneCalls(recovery, 'start').length, 1);
    assert.equal(journalCount(subjects[0]), 1);
    assert.equal(noTasks(recovery.operationId), '0');

    // 2. Target only the recovery key: real Auth storage and authority remain usable.
    const denied = await openScene(subjects[1], 'none');
    await signIn(denied, writerId, accountA);
    await denied.page.evaluate(() => { window.__gdprRecoveryStorageFault.deny = true; });
    await startGesture(denied);
    await check.poll(() => denied.page.evaluate(() => window.__gdprRecoveryStorageFault.attempts)).toBeGreaterThan(0);
    await check(denied.page.getByRole('button', { name: 'Anonymiser le sujet', exact: true })).toBeEnabled();
    assert.equal(sceneCalls(denied).length, 0, 'failed persistence must precede every START request');
    assert.equal(journalCount(subjects[1]), 0);
    assert.equal(await stored(denied, writerId), null);
    await denied.page.evaluate(() => { window.__gdprRecoveryStorageFault.deny = false; });
    await denied.page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
    assert.equal(sceneCalls(denied).length, 0, 'storage repair must never implicitly resend');

    // 3. The real gesture persisted, but no START reached Next; real lookup must stay absent.
    const absent = await openScene(subjects[2], 'before_dispatch');
    await signIn(absent, writerId, accountA);
    await startGesture(absent);
    await check.poll(() => absent.lost).toBe(true);
    await check(absent.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    await absent.page.reload();
    await check(absent.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    absent.holdLookup = true;
    await absent.page.getByRole('button', { name: resumeName, exact: true }).click();
    await bounded(absent.lookupSeen.promise, 'real missing lookup was not observed');
    await check(absent.page.getByRole('button', { name: 'Reprise en cours…', exact: true })).toBeDisabled();
    absent.releaseLookup.release();
    await bounded(absent.lookupTerminal.promise, 'missing lookup had no terminal browser event');
    await check.poll(() => absent.completedLookups).toBe(1);
    await check(absent.page.getByRole('button', { name: resumeName, exact: true })).toBeEnabled();
    assert.equal(sceneCalls(absent, 'start').length, 1, 'missing lookup must not fall back to START');
    assert.equal(sceneCalls(absent, 'resume').length, 0);
    assert.equal(journalCount(subjects[2]), 0);
    assert.equal(await stored(absent, writerId), absent.stored);
    await check(absent.page.getByText(unknownTitle, { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    console.log('Chromium recovery: real persisted account reference, committed START ACK loss, reload/A-B/late response, same-operation resume, scoped storage refusal and absent lookup without fallback passed.');
  } finally {
    for (const scene of scenes) { scene.closing = true; scene.releaseLookup.release(); scene.releaseResume.release(); }
    try {
      for (const scene of scenes) await scene.context.close();
      if (browser) await browser.close();
    } finally {
      try { if (app) await stopApp(app); }
      finally {
        if (fixtureCreated) {
          local.sqlFile(resolve('supabase/releases/20261108_gdpr_cleanup/close.sql'), 'restore exact owner-only GDPR capability');
          commit(`DELETE FROM internal.gdpr_cleanup_task WHERE operation_id IN (SELECT id FROM public.gdpr_erasure_log
            WHERE subject_kind='actor' AND subject_id IN (${subjects.map((id) => `'${id}'`).join(',')}));
            DELETE FROM public.gdpr_erasure_log WHERE subject_kind='actor' AND subject_id IN (${subjects.map((id) => `'${id}'`).join(',')});
            DELETE FROM public.actor WHERE id IN (${subjects.map((id) => `'${id}'`).join(',')});
            UPDATE public.app_user_profile SET role='tourism_agent' WHERE id IN ('${writerId}','${secondAccount.id}')`, 'remove only owned browser recovery fixture records and restore roles');
        }
      }
    }
  }
}
