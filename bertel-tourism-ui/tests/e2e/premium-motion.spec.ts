import { test, expect } from '@playwright/test';

/**
 * Task 24 — manual visual QA + E2E scenario (demo mode) for the premium-ui-motion plan.
 * Requires demo mode (NEXT_PUBLIC_ENABLE_DEMO_MODE=true) — see playwright.config.ts.
 *
 * Covers the design doc's "Integration and E2E checks":
 *  1. Dashboard -> Explorer -> CRM without a blank workspace.
 *  2/3. Open/close a centered Modal (ConfirmDialog), a drawer-variant Modal
 *       (MobileNavDrawer) and the object drawer (Sheet) — asserting the closing
 *       surface is briefly observable mid-exit before it unmounts.
 *  4. Editor draft save: pending -> success feedback on the topbar save button.
 *  5. Explorer view-mode switch: aria-pressed flips + indicator transform changes.
 *  6. Same modal/drawer checks under `prefers-reduced-motion: reduce` — no delayed exit.
 *
 * Note on scenario 2's "ConfirmDialog via a destructive action in /settings": every
 * ConfirmDialog consumer actually mounted under /settings (RefCodeEditor, TeamAdminPage,
 * AiProviderSettings, OrgBrandingForm) calls a live Supabase client directly with no
 * `session.demoMode` branch, and this worktree has no .env.local — so none of them can
 * render usable content in this demo-mode-only E2E run. `ModerationPage` (services/moderation.ts)
 * *does* fully mock its data behind `session.demoMode`, and its "Approuver" action opens the
 * exact same `ConfirmDialog` (built on the shared `Modal`) gating a real confirm-then-write
 * action — the closest verifiable equivalent available in this environment.
 */

test('navigates Dashboard -> Explorer -> CRM without a blank workspace', async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.locator('#main-content')).not.toBeEmpty();
  await expect(page.locator('.dashboard-layout')).toBeVisible({ timeout: 10000 });

  await page.goto('/explorer');
  await expect(page.locator('#main-content')).not.toBeEmpty();
  await expect(page.getByRole('navigation', { name: 'Modules' })).toBeVisible();
  await expect(page.getByText('Resultats').first()).toBeVisible();

  await page.goto('/crm');
  await expect(page.locator('#main-content')).not.toBeEmpty();
  await expect(page.locator('.crm-app')).toBeVisible({ timeout: 10000 });
});

test('opens and closes a centered ConfirmDialog modal with a visible exiting motion phase', async ({ page }) => {
  await page.goto('/moderation');

  const approveButton = page.getByRole('button', { name: 'Approuver' }).first();
  await expect(approveButton).toBeVisible({ timeout: 10000 });
  await approveButton.click();

  const dialog = page.getByRole('dialog', { name: 'Approuver la suggestion' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-motion-phase', 'open');

  await dialog.getByRole('button', { name: 'Annuler' }).click();
  // Poll immediately after the close click, before the 220ms exit timer unmounts the node —
  // Modal.tsx's usePresence keeps both overlay and card mounted through the exit transition.
  await expect(dialog).toHaveAttribute('data-motion-phase', 'exiting');
  await expect(dialog).toHaveCount(0, { timeout: 1000 });
});

test('opens and closes the MobileNavDrawer (drawer-variant Modal) on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');

  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  const dialog = page.getByRole('dialog', { name: 'Navigation' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveAttribute('data-motion-phase', 'open');

  await dialog.getByRole('button', { name: 'Fermer' }).click();
  // Drawer variant exits over --motion-surface (280ms) — same poll-immediately-after-close idea.
  await expect(dialog).toHaveAttribute('data-motion-phase', 'exiting');
  await expect(dialog).toHaveCount(0, { timeout: 1000 });
});

test('opens and closes the ObjectDrawer Sheet from the editor preview', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  await expect(page.locator('.edit-flat.object-editor')).toBeVisible({ timeout: 15000 });

  await page.getByRole('button', { name: 'Aperçu fiche' }).first().click();
  const sheet = page.locator('.drawer-panel');
  await expect(sheet).toBeVisible({ timeout: 10000 });
  await expect(sheet).toHaveAttribute('data-state', 'open');

  await sheet.getByRole('button', { name: 'Fermer' }).click();
  // ObjectDrawer is a shadcn/Radix Sheet (@radix-ui/react-dialog), not Modal.tsx — it carries
  // Radix's own data-state (open/closed), not data-motion-phase. Radix's Presence primitive
  // keeps the node mounted through the CSS exit animation the same way usePresence does.
  await expect(sheet).toHaveAttribute('data-state', 'closed');
  await expect(sheet).toHaveCount(0, { timeout: 1000 });
});

test('saves an editor draft and shows pending then success feedback', async ({ page }) => {
  await page.goto('/objects/HOTRUN0000000001/edit');
  await expect(page.locator('.edit-flat.object-editor')).toBeVisible({ timeout: 15000 });

  await page.getByLabel('Nom commercial').fill('Hotel Basalte & Lagon (E2E motion check)');

  const saveButton = page.locator('.edit-top .btn.primary');
  await expect(saveButton).toBeEnabled();
  await saveButton.click();

  await expect(saveButton).toHaveText(/Enregistrement/, { timeout: 2000 });
  await expect(saveButton).toHaveText('Enregistré', { timeout: 5000 });
});

test('switches the Explorer view mode and updates aria-pressed + indicator transform', async ({ page }) => {
  await page.goto('/explorer');

  const group = page.getByRole('group', { name: "Mode d'affichage des résultats" });
  await expect(group).toBeVisible();

  const listButton = group.getByRole('button', { name: 'Liste' });
  const splitButton = group.getByRole('button', { name: 'Split' });
  const indicator = group.locator('.view-switch__indicator');

  // Default persisted view mode is 'split' (explorer-view-store.ts) on a fresh context.
  await expect(splitButton).toHaveAttribute('aria-pressed', 'true');
  await expect(listButton).toHaveAttribute('aria-pressed', 'false');
  const beforeStyle = await indicator.getAttribute('style');

  await listButton.click();

  await expect(listButton).toHaveAttribute('aria-pressed', 'true');
  await expect(splitButton).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => indicator.getAttribute('style')).not.toBe(beforeStyle);
});

test('reduced motion: ConfirmDialog and MobileNavDrawer unmount without a delayed exiting phase', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });

  // Centered modal (ConfirmDialog on Moderation's "Approuver").
  await page.goto('/moderation');
  const approveButton = page.getByRole('button', { name: 'Approuver' }).first();
  await expect(approveButton).toBeVisible({ timeout: 10000 });
  await approveButton.click();

  const confirmDialog = page.getByRole('dialog', { name: 'Approuver la suggestion' });
  await expect(confirmDialog).toBeVisible();
  await expect(confirmDialog).toHaveAttribute('data-motion-phase', 'open');

  await confirmDialog.getByRole('button', { name: 'Annuler' }).click();
  // usePresence skips the exit-hold entirely under reduced motion: shouldRender flips to
  // false in the SAME state update as phase='exiting', so the node is gone well before the
  // (skipped) 220ms exit duration — a short timeout here is the point of the assertion.
  await expect(confirmDialog).toHaveCount(0, { timeout: 200 });

  // Drawer-variant modal (MobileNavDrawer) on a narrow viewport.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();

  const navDialog = page.getByRole('dialog', { name: 'Navigation' });
  await expect(navDialog).toBeVisible();
  await navDialog.getByRole('button', { name: 'Fermer' }).click();
  await expect(navDialog).toHaveCount(0, { timeout: 200 });
});
