import { expect, test } from '@playwright/test';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.describe.configure({ retries: 0 });

for (const width of [320, 390, 768, 1180]) {
  test(`map preview opens the same object with mouse and keyboard at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const origin = new URL(testInfo.project.use.baseURL as string).origin;
    const unexpected: string[] = [];
    const errors: string[] = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if ((url.origin === 'https://tiles.openfreemap.org' && url.pathname.startsWith('/styles/'))
        || (url.origin === 'https://demotiles.maplibre.org' && url.pathname === '/style.json')) {
        return route.fulfill({ json: { version: 8, sources: {}, layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#dce7e2' } },
        ] } });
      }
      if (url.origin === 'https://images.unsplash.com' && route.request().resourceType() === 'image') {
        return route.fulfill({ contentType: 'image/svg+xml', body:
          '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120"><rect width="260" height="120" fill="#427a78"/></svg>' });
      }
      unexpected.push(url.href);
      return route.abort();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/explorer');
    // The datetime attribute appears after the real layout hydrates. Filter via
    // the real search control to a demo object with a complete drawer fixture,
    // rather than a marker-only draft whose existing demo detail is unknown.
    await page.locator('time[datetime]').first().waitFor({ state: 'attached' });
    await page.getByRole('combobox', { name: 'Rechercher une fiche' }).fill('Hotel Basalte');
    await expect(page.locator('.explorer-result-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Carte', exact: true }).click();
    const pin = page.locator('.map-marker-pin').first();
    await expect(pin).toBeVisible({ timeout: 20_000 });
    const name = (await pin.getAttribute('aria-label'))!.replace(/^Ouvrir /, '');
    await pin.hover();
    const preview = page.getByRole('article', { name, exact: true });
    const heading = preview.getByRole('heading', { level: 3, name, exact: true });
    const open = preview.getByRole('button', { name: `Ouvrir la fiche ${name}`, exact: true });
    const close = preview.getByRole('button', { name: `Fermer l’aperçu de ${name}`, exact: true });
    await expect(heading).toBeVisible();
    await expect(preview.locator('img')).toBeVisible();
    const bounds = await preview.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const targets = await Promise.all([open, close].map(control => control.boundingBox()));
    for (const target of targets) {
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }
    const titleBounds = await heading.boundingBox();
    expect(targets[0]!.y).toBeGreaterThanOrEqual(titleBounds!.y + titleBounds!.height);
    await expect(open).toHaveClass(/primary-button/);
    await page.screenshot({ path: testInfo.outputPath(`map-preview-${width}.png`) });
    // A real click also proves the close target is not covered by map controls
    // at narrow widths; visibility and 44px bounds alone cannot prove this.
    await close.click();
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    await pin.hover();
    await expect(open).toBeVisible();
    // Real pointer action opens the existing drawer for the previewed object.
    await open.click();
    await expect(preview).toHaveCount(0);
    const drawer = page.locator('.drawer-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(drawer).toHaveCount(0);

    // Start from the actual pin, then use keyboard events for the preview flow.
    await page.mouse.move(1, 1);
    await pin.focus();
    await expect(open).toBeFocused();
    await page.mouse.move(1, 1);
    if (width === 1180) {
      // Cross the existing 3s minimum-visible/grace deadline with the action
      // focused; focus must keep the preview alive after the pointer leaves.
      await page.waitForTimeout(3300);
      await expect(open).toBeFocused();
    }
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    // Return focus through real Tab/Shift+Tab so closing does not itself reopen.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}
