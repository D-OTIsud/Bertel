import { expect, test } from '@playwright/test';

test('loads the demo explorer surface', async ({ page }) => {
  await page.goto('/explorer');

  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible();
  await expect(page.getByText('Resultats').first()).toBeVisible();
  await expect(page.getByText(/fiches/).first()).toBeVisible();
});
