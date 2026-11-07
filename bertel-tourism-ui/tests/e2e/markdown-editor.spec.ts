import { expect, test } from '@playwright/test';

test('Tab makes Markdown focus visible on the editor frame', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  const section = page.locator('#section-04');
  await expect(section).toBeVisible({ timeout: 20_000 });
  await section.getByRole('button', { name: 'Français', exact: true }).click();
  const label = 'Descriptif — Français';
  const frame = section.locator('.md-editor').filter({ has: page.getByLabel(label, { exact: true }) });
  const field = frame.getByLabel(label, { exact: true });
  const toolbar = frame.getByRole('toolbar', { name: 'Mise en forme' });
  const lastTool = toolbar.locator('button:enabled').last();

  // Start at the preceding control and let Chromium move focus natively.
  await lastTool.focus();
  await expect(lastTool).toBeFocused();
  await expect(frame).toHaveCSS('outline-style', 'none');
  await page.keyboard.press('Tab');
  await expect(field).toBeFocused();
  await expect(field).toBeInViewport();
  await expect.poll(() => field.evaluate((node) => node.matches(':focus-visible'))).toBe(true);
  await expect(frame).toHaveCSS('outline-style', 'solid');
  await expect(frame).toHaveCSS('outline-width', '2px');
  await expect(frame).toHaveCSS('outline-offset', '2px');
  await expect(field).toHaveCSS('outline-style', 'none');
  const ringColor = await frame.evaluate((node) => getComputedStyle(node).outlineColor);

  await page.keyboard.press('Shift+Tab');
  await expect(lastTool).toBeFocused();
  await expect(lastTool).toHaveCSS('outline-style', 'solid');
  await expect(lastTool).toHaveCSS('outline-width', '2px');
  await expect(lastTool).toHaveCSS('outline-color', ringColor);
  await expect(frame).toHaveCSS('outline-style', 'none');
});

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
  const dialogs: { type: string; message: string }[] = [];
  page.on('dialog', async (dialog) => {
    dialogs.push({ type: dialog.type(), message: dialog.message() });
    await dialog.accept(dialog.type() === 'prompt' ? 'javascript:alert(1)' : undefined);
  });
  await editor.getByRole('button', { name: 'Lien', exact: true }).click();
  await expect.poll(() => dialogs.map((dialog) => dialog.type)).toEqual(['prompt', 'alert']);
  expect(dialogs[1].message).toBe('Adresse non valide. Utilisez http(s):// ou mailto:.');
  await expect(region.locator('a')).toHaveAttribute('href', 'https://example.invalid/tourisme');
});
