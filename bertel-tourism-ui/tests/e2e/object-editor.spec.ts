import { test, expect } from '@playwright/test';

/**
 * Smoke test for the full-page object editor (/objects/[objectId]/edit).
 * Requires demo mode (NEXT_PUBLIC_ENABLE_DEMO_MODE=true) — see playwright.config.ts.
 */
test('full-page editor renders edit-flat shell and split-pane layout', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  await expect(page.locator('.edit-flat.object-editor')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('.type-ribbon')).toBeVisible();
  await expect(page.locator('.edit-nav')).toBeVisible();
  await expect(page.locator('.edit-nav__root-title')).toHaveText(/Sections de la fiche/);
  await expect(page.locator('#section-01')).toBeVisible();
  await expect(page.locator('.edit-side')).toBeVisible();
});
