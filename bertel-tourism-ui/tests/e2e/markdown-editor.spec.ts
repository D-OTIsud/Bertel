import { expect, test } from '@playwright/test';

test('Markdown editing preserves formatting across language switches and rejects unsafe links', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  const section = page.locator('#section-04');
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByRole('button', { name: 'Français', exact: true }).click();
  const region = section.getByLabel('Descriptif — Français', { exact: true });
  const editor = section.locator('.md-editor').filter({ has: page.getByLabel('Descriptif — Français', { exact: true }) });
  await region.fill('Titre témoin');
  await region.press('ControlOrMeta+A');
  await editor.getByRole('button', { name: 'Titre', exact: true }).click();
  await editor.getByRole('button', { name: 'Gras', exact: true }).click();
  await expect(region.locator('h2 strong')).toHaveText('Titre témoin');

  page.once('dialog', (dialog) => dialog.accept('https://example.invalid/tourisme'));
  await editor.getByRole('button', { name: 'Lien', exact: true }).click();
  await expect(region.locator('a')).toHaveAttribute('href', 'https://example.invalid/tourisme');

  await section.getByRole('button', { name: 'English', exact: true }).click();
  await section.getByLabel('Descriptif — English', { exact: true }).fill('Independent English text');
  await section.getByRole('button', { name: 'Français', exact: true }).click();
  await expect(region.locator('h2 strong')).toHaveText('Titre témoin');
  await expect(region.locator('a')).toHaveAttribute('href', 'https://example.invalid/tourisme');

  await region.press('ControlOrMeta+A');
  const dialogs: string[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push(dialog.type());
    await dialog.accept(dialog.type() === 'prompt' ? 'javascript:alert(1)' : undefined);
  });
  await editor.getByRole('button', { name: 'Lien', exact: true }).click();
  await expect.poll(() => dialogs).toEqual(['prompt', 'alert']);
  await expect(region.locator('a')).toHaveAttribute('href', 'https://example.invalid/tourisme');
});
