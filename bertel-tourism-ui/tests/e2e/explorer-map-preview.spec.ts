import { expect, test } from '@playwright/test';

test.use({
  viewport: { width: 1600, height: 1000 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

test('links sustained result hover and selection to the actual map popup', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const origin = new URL(testInfo.project.use.baseURL as string).origin;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A local, deterministic map style keeps this interaction check independent of tile services.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.pathname.includes('/styles/') || url.pathname.endsWith('/style.json')) {
      return route.fulfill({ json: {
        version: 8, sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e4ece6' } }],
      } });
    }
    if (route.request().resourceType() === 'image') {
      return route.fulfill({ contentType: 'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#d5e3dd"/></svg>' });
    }
    return route.abort();
  });

  await page.goto('/explorer');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.map-panel canvas.maplibregl-canvas')).toBeVisible();
  const result = page.locator('#result-card-HOTRUN0000000001');
  await expect(result).toBeVisible();
  const popup = page.locator('.map-hover-popup');
  await result.hover();
  await page.waitForTimeout(2000);
  await expect(popup).not.toBeVisible();

  const list = result.locator('..');
  await list.evaluate((element) => { element.scrollTop = 15; element.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(1600);
  await expect(popup).not.toBeVisible();
  await expect(popup).toBeVisible({ timeout: 3000 });
  await expect(popup.locator('.map-hover-card__name')).toHaveText('Hotel Basalte & Lagon');
  const activePin = page.locator('.map-marker-pin--active');
  await expect(activePin).toHaveCount(1);
  await expect(activePin).toHaveAccessibleName('Ouvrir Hotel Basalte & Lagon');
  await expect(activePin).toBeVisible();
  expect(await activePin.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(45);
  expect(await activePin.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await expect(page.locator('.map-marker-pin[aria-label="Ouvrir Hotel Basalte & Lagon"]')).toHaveCount(1);
  await expect(result).not.toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('explorer-map-preview.png') });

  await page.keyboard.press('Escape');
  await expect(popup).not.toBeVisible();
  await result.getByRole('button', { name: 'Ajouter a la selection', exact: true }).click();
  await expect(popup).toBeVisible({ timeout: 1500 });
  await expect(popup.locator('.map-hover-card__name')).toHaveText('Hotel Basalte & Lagon');
  await expect(page.getByRole('button', { name: 'Retirer de la selection', exact: true })).toBeVisible();
  await expect(page.locator('.drawer-panel')).not.toBeVisible();

  // A keyboard preview leaves focus on the result, rather than MapLibre stealing it.
  await page.keyboard.press('Escape');
  await result.focus();
  await expect(popup).toBeVisible({ timeout: 4500 });
  await expect(result).toBeFocused();
  expect(errors).toEqual([]);
});
