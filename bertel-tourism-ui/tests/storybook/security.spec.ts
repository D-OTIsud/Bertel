import { expect, test } from '@playwright/test';
import { connect } from 'node:net';

const storyPath = '/iframe.html?id=interface-modales--application&viewMode=story';
const attackerOrigin = 'http://attacker.invalid';
const eventType = 'bertel-security-probe';
type ProofWindow = Window & {
  proof: { raw: { origin: string; marker: string }[]; channel: string[] };
  target: Window;
  __STORYBOOK_ADDONS_CHANNEL__: { on: (type: string, listener: (marker: string) => void) => void };
};

test('dev defaults bind loopback and restrict foreign embedding', async ({ request, baseURL }) => {
  const port = Number(new URL(baseURL!).port);
  const denied = await new Promise<string>((resolve, reject) => {
    const socket = connect({ host: '127.0.0.2', port });
    socket.setTimeout(5_000);
    socket.once('connect', () => { socket.destroy(); reject(new Error('Storybook listens outside its default 127.0.0.1 address')); });
    socket.once('error', error => resolve((error as NodeJS.ErrnoException).code ?? 'unknown'));
    socket.once('timeout', () => { socket.destroy(); reject(new Error('Unexpected loopback connection timeout')); });
  });
  expect(denied).toBe('ECONNREFUSED');
  for (const path of ['/', '/iframe.html']) {
    const response = await request.get(path);
    expect(response.ok()).toBe(true);
    expect(response.headers()['content-security-policy']).toBe("frame-ancestors 'self' http://localhost:* http://*.localhost:* http://127.0.0.1:*");
  }
});

test('the real manager and existing application story remain interactive', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/?path=/story/interface-modales--application');
  const preview = page.frameLocator('#storybook-preview-iframe');
  const dialog = preview.getByRole('dialog', { name: 'Inviter des membres' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Annuler', exact: true }).click();
  await expect(dialog).toBeHidden();
  await preview.getByRole('button', { name: 'Ouvrir l’invitation' }).click();
  await expect(dialog).toBeVisible();
  expect(errors).toEqual([]);
});

test('Chromium enforces the dev frame-ancestors restriction', async ({ context, page, baseURL }) => {
  // Grant network access only to this routed fixture so Chromium's separate
  // local-network permission does not prevent this witness from reaching CSP.
  const foreignFrameOrigin = 'http://127.0.0.2:6017';
  await context.grantPermissions(['local-network-access'], { origin: foreignFrameOrigin });
  const violations: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error' && message.text().includes('frame-ancestors')) violations.push(message.text());
  });
  await context.route(`${foreignFrameOrigin}/fixture`, route => route.fulfill({
    contentType: 'text/html', body: `<!doctype html><iframe src="${baseURL}${storyPath}"></iframe>`,
  }));
  await page.goto(`${foreignFrameOrigin}/fixture`);
  await expect.poll(() => violations.length).toBeGreaterThan(0);
  expect(violations.join('\n')).toContain(baseURL!);
  await expect(page.frameLocator('iframe').getByRole('dialog', { name: 'Inviter des membres' })).toHaveCount(0);
});

test('a real foreign postMessage reaches the DOM but cannot enter the preview channel', async ({ context, page, baseURL }) => {
  const previewURL = `${baseURL}${storyPath}`;
  await context.route(`${attackerOrigin}/fixture`, route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><button id="open">Open preview</button><script>document.querySelector('button').onclick=()=>window.target=open(${JSON.stringify(previewURL)})</script>`,
  }));
  await page.goto(`${attackerOrigin}/fixture`);
  const popupPromise = page.waitForEvent('popup');
  await page.locator('#open').click();
  const preview = await popupPromise;
  const errors: string[] = [];
  preview.on('pageerror', error => errors.push(error.message));
  await expect(preview.getByRole('dialog', { name: 'Inviter des membres' })).toBeVisible();
  await preview.evaluate(type => {
    const target = window as unknown as ProofWindow;
    target.proof = { raw: [], channel: [] };
    target.addEventListener('message', event => {
      if (typeof event.data !== 'string') return;
      let data;
      try { data = JSON.parse(event.data); } catch { return; }
      if (data.event?.type === type) target.proof.raw.push({ origin: event.origin, marker: data.event.args[0] });
    });
    target.__STORYBOOK_ADDONS_CHANNEL__.on(type, marker => target.proof.channel.push(marker));
    target.postMessage(JSON.stringify({ key: 'storybook-channel', event: { type, args: ['same'], from: 'manager' } }), location.origin);
  }, eventType);
  await expect.poll(() => preview.evaluate(() => (window as unknown as ProofWindow).proof.channel)).toEqual(['same']);
  await page.evaluate(({ origin, type }) => {
    (window as unknown as ProofWindow).target.postMessage(JSON.stringify({ key: 'storybook-channel', event: { type, args: ['foreign'], from: 'manager' } }), origin);
  }, { origin: baseURL!, type: eventType });
  // The real browser supplies event.origin; observing it prevents a false green
  // caused by a lost popup reference, COOP, or a message that never arrived.
  await expect.poll(() => preview.evaluate(() => (window as unknown as ProofWindow).proof.raw))
    .toContainEqual({ origin: attackerOrigin, marker: 'foreign' });
  // A later legitimate event is an observable processing barrier, rather than
  // treating a short sleep or an unresponsive transport as proof of rejection.
  await preview.evaluate(type => window.postMessage(JSON.stringify({ key: 'storybook-channel',
    event: { type, args: ['after'], from: 'manager' } }), location.origin), eventType);
  await expect.poll(() => preview.evaluate(() => (window as unknown as ProofWindow).proof.channel)).toContain('after');
  expect(await preview.evaluate(() => (window as unknown as ProofWindow).proof.channel)).toEqual(['same', 'after']);
  expect(errors).toEqual([]);
  await preview.close();
});
