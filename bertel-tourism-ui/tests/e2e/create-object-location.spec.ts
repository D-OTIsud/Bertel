import { expect, test, type Page } from '@playwright/test';

// Keep the synthetic, intercepted API within the application's existing CSP.
const referenceOrigin = 'https://creation-reference.supabase.co';
const communes = [
  { insee_code: '97403', name: 'Entre-Deux', is_active: true, thesaurus_lifecycle: 'active', thesaurus_assignable: true, thesaurus_valid_today: true },
  { insee_code: '97422', name: 'Le Tampon', is_active: true, thesaurus_lifecycle: 'active', thesaurus_assignable: true, thesaurus_valid_today: true },
];
const postcodes = [
  { postcode: '97414', insee_code: '97403' },
  { postcode: '97418', insee_code: '97422' },
  { postcode: '97430', insee_code: '97422' },
  { postcode: '99998', insee_code: '97403' },
  { postcode: '99998', insee_code: '97422' },
];

async function openCreation(page: Page) {
  await page.addInitScript(({ origin }) => {
    window.__APP_CONFIG__ = {
      NEXT_PUBLIC_ENABLE_DEMO_MODE: 'true',
      NEXT_PUBLIC_SUPABASE_URL: origin,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'synthetic-public-key',
    };
  }, { origin: referenceOrigin });
  await page.route('**/rest/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const headers = {
      'access-control-allow-origin': '*',
      'access-control-allow-headers': '*',
      'access-control-allow-methods': 'GET,POST,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    if (url.pathname.endsWith('/rpc/thesaurus_generation')) {
      await route.fulfill({ headers, json: 1 });
    } else if (url.pathname.endsWith('/rpc/thesaurus_reference_snapshot')) {
      await route.fulfill({ headers, json: { meta: { vocabulary_release: 1 }, refCodeByDomain: {}, tables: { ref_commune: communes } } });
    } else if (url.pathname.endsWith('/ref_commune_postcode')) {
      await route.fulfill({ headers, json: postcodes });
    } else {
      // Demo creation must never send a mutation to a real service.
      await route.abort();
    }
  });
  await page.goto('/explorer');
  await page.getByRole('button', { name: 'Créer une fiche', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Créer une fiche' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel(/code postal/i)).toBeEnabled();
  await expect(dialog.getByLabel(/^commune/i)).toHaveAttribute('aria-busy', 'false');
  await expect(dialog.getByText('Impossible de charger les communes.', { exact: false })).toBeHidden();
  return dialog;
}

test('creation requires an address and derives the commune from a postal code', async ({ page }, testInfo) => {
  let requestedEditor = '';
  page.on('request', (request) => {
    const path = new URL(request.url()).pathname;
    if (/\/objects\/DEMO-RES-\d+\/edit/.test(path)) requestedEditor = path;
  });
  const dialog = await openCreation(page);
  const postcode = dialog.getByLabel(/code postal/i);
  const commune = dialog.getByLabel(/^commune/i);
  await expect(postcode).toHaveAttribute('required', '');
  await expect(commune).toHaveAttribute('required', '');
  await expect(postcode).toHaveAttribute('inputmode', 'numeric');
  await expect(postcode).toHaveAttribute('aria-invalid', 'false');
  await dialog.getByLabel(/nom de la fiche/i).fill('Restaurant de la création');
  const restaurant = dialog.getByRole('radio', { name: /^Restaurant$/i });
  await restaurant.focus();
  await page.keyboard.press('Space');
  await expect(restaurant).toBeChecked();
  await dialog.getByRole('button', { name: /^Créer/i }).click();
  await expect(postcode).toBeFocused();
  await expect(page).toHaveURL(/\/explorer/);

  await postcode.fill('97418');
  await expect(commune.locator('option:checked')).toHaveText('Le Tampon');
  await postcode.fill('97414');
  await expect(commune.locator('option:checked')).toHaveText('Entre-Deux');
  await page.screenshot({ path: testInfo.outputPath('create-object-location-desktop.png') });
  await dialog.getByRole('button', { name: /^Créer/i }).click();
  await expect(dialog).toBeHidden();
  // Demo IDs have no persisted workspace. Verify the successful creation's
  // editor navigation without depending on that unrelated demo read fallback.
  await expect.poll(() => requestedEditor).toMatch(/\/objects\/DEMO-RES-\d+\/edit/);
});

test('a shared postal code requires a commune selection and the dialog fits a narrow viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openCreation(page);
  const postcode = dialog.getByLabel(/code postal/i);
  const commune = dialog.getByLabel(/^commune/i);
  await dialog.getByLabel(/nom de la fiche/i).fill('Restaurant mobile');
  await postcode.fill('99998');
  await expect(commune).toHaveValue('');
  await commune.selectOption('97403');
  await expect(commune.locator('option:checked')).toHaveText('Entre-Deux');
  expect(await commune.evaluate((element) => {
    const styles = getComputedStyle(element);
    const available = element.clientHeight - parseFloat(styles.paddingTop) - parseFloat(styles.paddingBottom);
    return available >= parseFloat(styles.fontSize) * 1.2;
  })).toBe(true);
  const create = dialog.getByRole('button', { name: /^Créer/i });
  expect(await create.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return [0.25, 0.5, 0.75].every((fraction) =>
      element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height * fraction)));
  })).toBe(true);
  const bounds = (await dialog.boundingBox())!;
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(391);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(845);
  await page.screenshot({ path: testInfo.outputPath('create-object-location-mobile.png') });
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await page.getByRole('button', { name: 'Créer une fiche', exact: true }).click();
  await expect(page.getByRole('dialog').getByLabel(/code postal/i)).toHaveValue('');
  await expect(page.getByRole('dialog').getByLabel(/^commune/i)).toHaveValue('');
});
