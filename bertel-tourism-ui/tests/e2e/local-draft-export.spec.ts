import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('a failed local draft write can export the latest edits while keeping the previous recovery copy', async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('The local application origin is required');
  const origin = new URL(baseURL).origin;
  await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.addInitScript(() => {
    const setItem = Storage.prototype.setItem;
    Object.defineProperty(window, '__draftStoreBlocked', { value: false, writable: true });
    Storage.prototype.setItem = function (key: string, value: string) {
      if ((window as unknown as Record<string, unknown>).__draftStoreBlocked && key.startsWith('object-editor-draft:')) {
        throw new DOMException('Synthetic draft storage quota', 'QuotaExceededError');
      }
      setItem.call(this, key, value);
    };
  });
  const objectId = 'HOTRUN0000000001';
  await page.goto(`/objects/${objectId}/edit`);
  const name = page.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
  await expect(name).toBeVisible();
  await name.fill('B — récupération précédente');
  const storedDraft = () => page.evaluate((id) => {
    const key = Object.keys(localStorage).find((candidate) => candidate.startsWith('object-editor-draft:') && candidate.endsWith(`:${id}`));
    return key ? localStorage.getItem(key) : null;
  }, objectId);
  await expect.poll(async () => JSON.parse((await storedDraft()) ?? '{}').draft?.generalInfo?.name).toBe('B — récupération précédente');
  const previousCopy = await storedDraft();
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__draftStoreBlocked = true; });
  await name.fill('C — saisie actuelle à exporter');
  const warning = page.getByRole('alert').filter({ hasText: 'Brouillon local indisponible' });
  await expect(warning).toContainText('Vos modifications restent dans cet onglet. Enregistrez ou exportez-les avant de fermer.');
  const exportButton = warning.getByRole('button', { name: 'Exporter le brouillon JSON', exact: true });
  const downloadEvent = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${objectId}-brouillon.json`);
  const filename = await download.path();
  if (!filename) throw new Error('The browser did not produce a draft download');
  const exported = JSON.parse(await readFile(filename, 'utf8'));
  expect(exported).toMatchObject({ format: 'bertel-object', version: 2, objectId, type: 'HOT' });
  expect(exported.modules.generalInfo.name).toBe('C — saisie actuelle à exporter');
  await expect(name).toHaveValue('C — saisie actuelle à exporter');
  await expect(warning).toBeVisible();
  expect(await storedDraft()).toBe(previousCopy);

  for (const width of [320, 390, 1180]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(exportButton).toBeVisible();
    const bounds = await exportButton.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    await warning.screenshot({ path: testInfo.outputPath(`draft-warning-${width}.png`) });
  }
});
