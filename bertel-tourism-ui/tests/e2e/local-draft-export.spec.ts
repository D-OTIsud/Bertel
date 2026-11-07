import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }, testInfo) => {
  const baseURL = testInfo.project.use.baseURL;
  if (!baseURL) throw new Error('The local application origin is required');
  const origin = new URL(baseURL).origin;
  await page.route(/^https?:\/\//, (route) => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
});

test('a failed local draft write can export and recover the latest edits', async ({ page }, testInfo) => {
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
  const draftKey = `object-editor-draft:usr-local-marie:${objectId}`;
  const currentName = 'C — saisie actuelle à exporter';
  await page.goto(`/objects/${objectId}/edit`);
  const name = page.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
  await expect(name).toBeVisible();
  await name.fill('B — récupération précédente');
  const storedDraft = () => page.evaluate((key) => localStorage.getItem(key), draftKey);
  const storedName = async () => JSON.parse((await storedDraft()) ?? '{}').draft?.generalInfo?.name;
  await expect.poll(storedName).toBe('B — récupération précédente');
  const previousCopy = await storedDraft();
  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__draftStoreBlocked = true; });
  await name.fill(currentName);
  const warning = page.getByRole('alert').filter({ hasText: 'Brouillon local indisponible' });
  await expect(warning).toContainText('Vos modifications restent dans cet onglet. Enregistrez ou exportez-les avant de fermer.');
  const exportButton = warning.getByRole('button', { name: 'Exporter le brouillon JSON', exact: true });
  const downloadEvent = page.waitForEvent('download');
  await exportButton.click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toBe(`${objectId}-brouillon.json`);
  const filename = testInfo.outputPath(download.suggestedFilename());
  await download.saveAs(filename);
  const exported = JSON.parse(await readFile(filename, 'utf8'));
  expect(exported).toMatchObject({ format: 'bertel-object', version: 2, objectId, type: 'HOT' });
  expect(exported.modules.generalInfo.name).toBe(currentName);
  await expect(name).toHaveValue(currentName);
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

  await page.evaluate(() => { (window as unknown as Record<string, unknown>).__draftStoreBlocked = false; });
  const replacementName = 'D — saisie après rétablissement';
  await name.fill(replacementName);
  await expect.poll(storedName).toBe(replacementName);
  await expect(warning).toBeHidden();

  await page.getByRole('button', { name: 'Import / export', exact: true }).click();
  const importDialog = page.getByRole('dialog', { name: 'Import / export de la fiche' });
  await importDialog.getByLabel('Importer un fichier JSON').setInputFiles(filename);
  const confirmation = page.getByRole('dialog', { name: 'Importer et remplacer le brouillon' });
  await expect(confirmation).toBeVisible();
  expect(await storedName()).toBe(replacementName);
  await confirmation.getByRole('button', { name: 'Remplacer', exact: true }).click();
  await expect(name).toHaveValue(currentName);
  await expect.poll(storedName).toBe(currentName);

  await page.reload();
  await expect(name).toHaveValue(currentName);
  await expect(warning).toBeHidden();
});

for (const denied of [['localStorage'], ['localStorage', 'sessionStorage']]) {
  test(`a refused ${denied.join(' and ')} getter still lets the demo editor export current input`, async ({ page }) => {
    await page.addInitScript((names) => {
      for (const name of names) Object.defineProperty(window, name, {
        configurable: true,
        get: () => { throw new DOMException('Synthetic storage access refusal', 'SecurityError'); },
      });
    }, denied);
    const objectId = 'HOTRUN0000000001';
    await page.goto(`/objects/${objectId}/edit`);
    const name = page.locator('#section-01').getByRole('textbox', { name: /Nom commercial/ });
    await expect(name).toBeVisible();
    await name.fill('C — saisie sans accès au stockage');
    const warning = page.getByRole('alert').filter({ hasText: 'Brouillon local indisponible' });
    await expect(warning).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await warning.getByRole('button', { name: 'Exporter le brouillon JSON', exact: true }).click();
    const download = await downloaded;
    const filename = await download.path();
    if (!filename) throw new Error('The browser did not produce a draft download');
    const envelope = JSON.parse(await readFile(filename, 'utf8'));
    expect(envelope).toMatchObject({ format: 'bertel-object', version: 2, objectId, type: 'HOT' });
    expect(envelope.modules.generalInfo.name).toBe('C — saisie sans accès au stockage');
    await expect(name).toHaveValue('C — saisie sans accès au stockage');
    await expect(warning).toBeVisible();
  });
}
