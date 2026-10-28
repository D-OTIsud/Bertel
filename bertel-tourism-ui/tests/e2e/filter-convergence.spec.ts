import { expect, test } from '@playwright/test';

// Runs against the existing application demo mode. No store injection or
// preview adapter: all state changes go through production controls and URLs.
test.beforeEach(async ({ page }) => {
  await page.goto('/dashboard');
  await expect(page.getByRole('region', { name: 'Filtres actifs' })).toBeVisible();
});

test('Dashboard status, period and both reset entries agree', async ({ page }) => {
  const published = page.getByRole('button', { name: 'Publié', exact: true });
  const draft = page.getByRole('button', { name: 'Brouillon', exact: true });
  await expect(published).toHaveAttribute('aria-pressed', 'true');
  await expect(draft).toHaveAttribute('aria-pressed', 'false');
  await draft.click();
  await expect(published).toHaveAttribute('aria-pressed', 'true');
  await expect(draft).toHaveAttribute('aria-pressed', 'true');
  await published.click();
  await expect(draft).toHaveAttribute('aria-pressed', 'true');

  for (const resetInBar of [true, false]) {
    await page.getByRole('button', { name: '7 j', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Retirer le filtre : Fiches mises à jour', exact: true })).toBeVisible();
    const scope = resetInBar ? page.getByRole('region', { name: 'Filtres actifs' }) : page.locator('.filter-context-panel');
    await scope.getByRole('button', { name: 'Réinitialiser', exact: true }).click();
    await expect(page.locator('#dash-period-from')).toHaveValue('');
    await expect(page.locator('#dash-period-to')).toHaveValue('');
    await expect(published).toHaveAttribute('aria-pressed', 'true');
    await expect(draft).toHaveAttribute('aria-pressed', 'false');
  }
});

test('a capacity is remembered in multi-type, restored in mono-type and excluded from the bridge', async ({ page }) => {
  await page.getByRole('button', { name: 'Hébergements', exact: true }).click();
  const section = page.getByRole('button', { name: /^Section Hébergements/ });
  if (await section.getAttribute('aria-expanded') === 'false') await section.click();
  await page.getByLabel('Ajouter un critère de capacité').selectOption('beds');
  await page.getByRole('spinbutton', { name: 'Lits — minimum', exact: true }).fill('20');
  await page.getByRole('spinbutton', { name: 'Lits — maximum', exact: true }).fill('60');
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click();
  await expect(page.locator('.explorer-active-filters__memorized').getByRole('button', { name: /Capacité héb/ })).toContainText('20');
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click();
  await expect(page.locator('.explorer-active-filters__applied').getByRole('button', { name: /Capacité héb/ })).toContainText('60');
  await expect(page.getByRole('spinbutton', { name: 'Lits — minimum', exact: true })).toHaveValue('20');
  await page.getByRole('button', { name: 'Restaurants', exact: true }).click();
  await page.getByRole('button', { name: 'Ouvrir dans l’Explorateur', exact: true }).click();
  await expect(page).toHaveURL(/\/explorer\?/);
  await expect(page.getByRole('button', { name: /Retirer le filtre : Statut · Publié/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Retirer le filtre : Capacité héb/ })).toHaveCount(0);
  await page.locator('a[href="/dashboard"]').first().click();
  await expect(page.locator('.explorer-active-filters__memorized').getByRole('button', { name: /Capacité héb/ })).toContainText('20');
});

test('Dashboard search announces Explorer and retains the entered text after navigation', async ({ page }) => {
  await page.getByRole('combobox', { name: 'Rechercher une fiche dans Explorer' }).fill('jardin');
  await page.getByRole('link', { name: 'Ouvrir Explorer', exact: true }).click();
  await expect(page).toHaveURL(/\/explorer/);
  await expect(page.getByRole('combobox', { name: 'Rechercher une fiche', exact: true })).toHaveValue('jardin');
});
