import { expect, test, type Page } from '@playwright/test';

// Opt in against a dedicated loopback Next dev server in non-demo mode.
test.skip(process.env.PLAYWRIGHT_AUTH_SSR !== '1', 'requires the isolated non-demo SSR fixture');
test.use({ trace: 'off', screenshot: 'off', video: 'off' });

async function openLogin(page: Page, baseURL: string | undefined) {
  const origin = new URL(baseURL ?? '');
  if (origin.protocol !== 'http:' || origin.hostname !== '127.0.0.1' || !origin.port) {
    throw new Error('The login fixture requires a dedicated loopback app');
  }
  const requests = { native: 0, handler: 0 };
  await page.route('**/*', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== origin.origin) return route.abort();
    if (request.isNavigationRequest() &&
        (request.method() !== 'GET' || url.searchParams.has('email') || url.searchParams.has('password'))) {
      requests.native += 1;
      return route.fulfill({ status: 204 });
    }
    if (request.method() === 'POST' && url.pathname === '/auth/v1/token' &&
        url.searchParams.get('grant_type') === 'password') {
      requests.handler += 1;
      return route.fulfill({ status: 400, json: { code: 'invalid_credentials', msg: 'Invalid login credentials' } });
    }
    if (request.method() !== 'GET') return route.abort();
    return route.continue();
  });
  await page.goto(new URL('/login', origin).toString());
  return requests;
}

async function fillCredentials(page: Page) {
  await page.getByLabel('Adresse e-mail').fill('login-fixture@example.invalid');
  await page.getByLabel('Mot de passe', { exact: true }).fill('Synthetic-login-fixture-only');
}

test('SSR credentials never submit natively with JavaScript disabled', async ({ browser, baseURL }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const requests = await openLogin(page, baseURL);
    await fillCredentials(page);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.getByLabel('Mot de passe', { exact: true }).press('Enter');
    expect(requests).toEqual({ native: 0, handler: 0 });
  } finally {
    await context.close();
  }
});

test('the hydrated form still dispatches the password handler', async ({ page, baseURL }) => {
  const requests = await openLogin(page, baseURL);
  const forgot = page.getByRole('button', { name: 'Mot de passe oublié ?' });
  const back = page.getByRole('button', { name: 'Retour à la connexion' });
  // This reversible local action confirms the handler is mounted before entering credentials.
  await expect(async () => {
    if (await back.isVisible()) return;
    await forgot.click({ timeout: 1000 });
    await expect(back).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await back.click();
  await fillCredentials(page);
  await page.getByRole('button', { name: 'Se connecter' }).click();
  await expect.poll(() => requests.handler).toBe(1);
  expect(requests.native).toBe(0);
});
