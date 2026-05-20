import { test, expect } from '@playwright/test';

/**
 * Smoke test for the full-page object editor route (/objects/[objectId]/edit).
 *
 * Skipped for now: the editor's workspace query (the get_object_resource RPC)
 * has no demo-mode mock — src/data/mock.ts only covers the detail view, not the
 * full ObjectWorkspaceResource (modules + permissions). Enable this test once a
 * workspace fixture exists, or run it against a seeded Supabase environment by
 * replacing the object id below with a real one.
 */
test.skip('full-page editor renders the shell and the proof sections', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  await expect(page.locator('.object-editor')).toBeVisible();
  await expect(page.locator('.type-ribbon')).toBeVisible();
  await expect(page.locator('.edit-nav')).toBeVisible();
  await expect(page.locator('#section-01')).toBeVisible();
  await expect(page.locator('#section-04')).toBeVisible();
});
