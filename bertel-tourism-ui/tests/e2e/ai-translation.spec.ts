import { expect, test, type Page } from '@playwright/test';

/** Demo mode exercises manual editing without authenticating or invoking a provider. */
async function openDescriptions(page: Page) {
  await page.goto('/objects/HOTRUN0000000001/edit');
  const section = page.locator('#section-04');
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByRole('button', { name: 'Français', exact: true }).click();
  await expect(section.getByText(/traduire vos textes.*IA/i)).toHaveCount(0);
  const chapo = section.getByLabel('Accroche — Français', { exact: true });
  await expect(chapo).toBeEditable();
  await chapo.fill('Un hôtel créole au bord du lagon.');
  await section.getByLabel('Descriptif — Français', { exact: true }).fill('Profitez du jardin et de la terrasse pour découvrir notre cuisine réunionnaise.');
  return section;
}

test('demo mode keeps manual French and English editing available without AI controls or requests', async ({ page }, testInfo) => {
  const translationPosts: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/ai/translate') && request.method() === 'POST') translationPosts.push(request.url());
  });
  const section = await openDescriptions(page);
  const before = await section.getByLabel('Accroche — Français', { exact: true }).innerText();
  await section.getByRole('button', { name: 'English', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Traduire avec l’IA', exact: true })).toHaveCount(0);
  await section.getByLabel('Accroche — English', { exact: true }).fill('A lagoon-side Creole hotel.');
  await section.getByLabel('Descriptif — English', { exact: true }).fill('Enjoy the garden and terrace.');
  await expect(section.getByLabel('Accroche — English', { exact: true })).toHaveText('A lagoon-side Creole hotel.');
  expect(translationPosts).toEqual([]);
  await section.screenshot({ path: testInfo.outputPath('ai-translation-desktop.png') });
  await section.getByRole('button', { name: 'Français', exact: true }).click();
  await expect(section.getByLabel('Accroche — Français', { exact: true })).toHaveText(before);
});

test('language tabs fit a 390px mobile viewport when AI controls are unavailable', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const section = await openDescriptions(page);
  for (const language of ['English', 'Créole', 'Deutsch', 'Español']) {
    const tab = section.getByRole('button', { name: language, exact: true });
    await expect(tab).toBeVisible();
    // A clipped parent may hide tabs while document.scrollWidth still fits the viewport.
    const tabBounds = await tab.boundingBox();
    expect(tabBounds).not.toBeNull();
    expect(tabBounds!.x).toBeGreaterThanOrEqual(0);
    expect(tabBounds!.x + tabBounds!.width).toBeLessThanOrEqual(391);
  }
  await section.getByRole('button', { name: 'English', exact: true }).click();
  await expect(section.getByRole('button', { name: 'Traduire avec l’IA', exact: true })).toHaveCount(0);
  const bounds = await section.boundingBox();
  expect(bounds).not.toBeNull();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(391);
  const viewport = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
  expect(viewport.content).toBeLessThanOrEqual(viewport.width + 1);
  await section.screenshot({ path: testInfo.outputPath('ai-translation-mobile.png') });
});
