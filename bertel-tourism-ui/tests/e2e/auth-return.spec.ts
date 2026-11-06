import { expect, test } from '@playwright/test';

test('the real login route keeps normalized external returns on the application origin', async ({ page, baseURL }) => {
  test.setTimeout(60_000);
  const origin = new URL(baseURL!).origin;
  const externalNavigations: string[] = [];
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.isNavigationRequest() && new URL(request.url()).origin !== origin) {
      externalNavigations.push(request.url());
      await route.abort();
    } else await route.continue();
  });
  // Exercise the reported case: an already connected user follows a login link.
  await page.goto('/explorer');
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible();
  for (const from of ['/\\outside.example', '/\t/outside.example', '/\n/outside.example', '//outside.example']) {
    await page.goto(`/login?from=${encodeURIComponent(from)}`);
    await expect(page).toHaveURL(`${origin}/explorer`, { timeout: 15_000 });
  }
  expect(externalNavigations).toEqual([]);
});

test('the real login route preserves an internal query and fragment', async ({ page, baseURL }) => {
  const destination = '/explorer?audit_return=1#existing-tab';
  await page.goto(`/login?from=${encodeURIComponent(destination)}`);
  await expect(page).toHaveURL(new URL(destination, baseURL!).toString());
});
