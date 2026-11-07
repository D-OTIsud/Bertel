import assert from 'node:assert/strict';
import { expect } from '@playwright/test';

const assertion = expect.configure({ timeout: 30_000 });

export async function openDiscoveryVisitor(app, local, ownedBrowser, fixture) {
  const context = await ownedBrowser.newContext();
  try {
    const page = await context.newPage();
    const sessionUrl = app.origin + '/api/sandbox/session';
    let tokens;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (!ownedBrowser.permitted.has(url.origin)) return route.abort();
      if (url.href !== sessionUrl || request.method() !== 'POST') return route.continue();
      // Keep the real response body in memory before the page replaces its document.
      const response = await route.fetch({ maxRedirects: 0, maxRetries: 0, timeout: 30_000 });
      if (response.ok()) tokens = await response.json().catch(() => null);
      await route.fulfill({ response });
    });

    const entryUrl = app.origin + '/test';
    const [session, entry] = await Promise.all([
      page.waitForResponse((response) => response.url() === sessionUrl && response.request().method() === 'POST', { timeout: 45_000 }),
      page.goto(entryUrl, { waitUntil: 'commit' }),
    ]);
    assert.ok(entry?.status() === 200 && entry.url() === entryUrl && entry.request().redirectedFrom() === null,
      'the visitor must load the public discovery document directly');
    assert.equal(session.status(), 200, 'the browser must open a real discovery session');
    assert.ok(/(?:^|,\s*)no-store(?:,|$)/.test(session.headers()['cache-control'] ?? ''),
      'the browser session response must not be cached');
    assert.ok(typeof tokens?.access_token === 'string' && tokens.access_token.length > 0
      && typeof tokens.refresh_token === 'string' && tokens.refresh_token.length > 0
      && Object.keys(tokens).length === 2, 'the browser must receive only the restricted session tokens');

    await page.waitForURL((url) => url.origin === app.origin && url.pathname === '/explorer', { timeout: 45_000 });
    await assertion(page.getByText('Bac à sable', { exact: true })).toBeVisible();
    await assertion(page.getByRole('link', { name: 'Quitter le test', exact: true })).toBeVisible();

    const filters = new URLSearchParams({ buckets: 'HOT', status: 'published', search: fixture.search });
    const [catalogue] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        if (response.url() !== local.origin + '/rest/v1/rpc/list_object_resources_filtered_page'
          || request.method() !== 'POST') return false;
        const body = request.postDataJSON();
        return body?.p_search === fixture.search && body.p_view === 'card';
      }, { timeout: 45_000 }),
      page.goto(app.origin + '/explorer?' + filters, { waitUntil: 'commit' }),
    ]);
    assert.equal(catalogue.status(), 200, 'the filtered browser catalogue must respond successfully');
    const headers = await catalogue.request().allHeaders();
    assert.ok(headers.authorization === `Bearer ${tokens.access_token}` && headers.apikey === local.anonymous.apikey,
      'Explorer must request the catalogue with the discovery session it just opened');
    const cards = (await catalogue.json())?.data;
    assert.ok(Array.isArray(cards) && cards.some((row) => row.id === fixture.testId)
      && cards.every((row) => row.id !== fixture.publicId), 'the filtered catalogue must stay in the test realm');
    await assertion(page.getByRole('heading', { name: fixture.testTitle, exact: true })).toBeVisible();
    await assertion(page.getByRole('heading', { name: fixture.publicTitle, exact: true })).toHaveCount(0);
    return tokens.access_token;
  } finally {
    await context.close();
  }
}
