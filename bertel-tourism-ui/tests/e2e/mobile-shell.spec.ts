import { expect, test, type Page } from '@playwright/test';

// UX-07 — < 768px, `.app-shell` gardait ses deux colonnes de grille
// (`var(--sidebar-w) minmax(0, 1fr)`) alors que la Sidebar est masquée : le
// contenu se plaçait tout seul dans la première colonne, restée à 64px.
const SIDEBAR_WIDTH = 64;
const MOBILE_WIDTHS = [320, 390, 767];
const TOLERANCE_PX = 2;

async function mainWidth(page: Page): Promise<number> {
  const box = await page.locator('#main-content').boundingBox();
  if (!box) throw new Error('#main-content introuvable');
  return box.width;
}

for (const width of MOBILE_WIDTHS) {
  test(`Explorer : le main egale la largeur d'ecran (+/-${TOLERANCE_PX}px) a ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/explorer');
    expect(Math.abs((await mainWidth(page)) - width)).toBeLessThanOrEqual(TOLERANCE_PX);
    const header = page.locator('header').first();
    await expect(header.getByRole('button', { name: 'Créer une fiche' })).toBeVisible();
    const headerSize = await header.evaluate((element) => ({
      client: element.clientWidth,
      scroll: element.scrollWidth,
    }));
    expect(headerSize.scroll).toBeLessThanOrEqual(headerSize.client + TOLERANCE_PX);
    const title = page.getByRole('heading', { name: 'Hotel Basalte & Lagon', exact: true });
    await expect(title).toBeVisible();
    const titleBox = await title.boundingBox();
    expect(titleBox?.height).toBeGreaterThanOrEqual(17);
  });
}

// Second module (pas seulement Explorer) : le blocage de grille était global au shell,
// pas propre à une page — la régression doit le couvrir sur le CRM aussi.
test("CRM : le main egale la largeur d'ecran (+/-2px) a 390px", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/crm');
  expect(Math.abs((await mainWidth(page)) - 390)).toBeLessThanOrEqual(TOLERANCE_PX);
});

test("Explorer : le main egale largeur - rail (64px) au seuil bureau 768px", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 844 });
  await page.goto('/explorer');
  expect(Math.abs((await mainWidth(page)) - (768 - SIDEBAR_WIDTH))).toBeLessThanOrEqual(TOLERANCE_PX);
});

// UX-01 — sous 768px la Sidebar (seule à porter Profil/Notifications) est masquée ;
// le tiroir de navigation mobile doit offrir les deux mêmes points d'accès.
test('la navigation mobile ouvre Notifications puis Profil sans laisser deux tiroirs empilés', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/explorer');

  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  const nav = page.getByRole('dialog', { name: 'Navigation' });
  await expect(nav).toBeVisible();

  await nav.getByRole('button', { name: /Notifications/ }).click();
  await expect(nav).toBeHidden();
  const notifications = page.getByRole('dialog', { name: 'Notifications' });
  await expect(notifications).toBeVisible();
  await notifications.getByRole('button', { name: 'Fermer les notifications' }).click();
  await expect(notifications).toBeHidden();

  await page.getByRole('button', { name: 'Ouvrir la navigation' }).click();
  await expect(nav).toBeVisible();
  await nav.getByRole('button', { name: 'Profil' }).click();
  await expect(nav).toBeHidden();
  const profile = page.getByRole('dialog', { name: 'Mon espace' });
  await expect(profile).toBeVisible();
});

// Hydratation — `explorer-references` est une query persistée (meta.persist,
// Providers.tsx) : une fois écrite en cache par un premier chargement, un
// RECHARGEMENT peut la restaurer avant le premier rendu client, alors que le
// HTML serveur ne l'a jamais portée. On laisse le premier chargement écrire le
// cache avant de recharger. Les erreurs des DEUX chargements sont conservées.
test("aucun désaccord d'hydratation au chargement ni après restauration des références", async ({ page }) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/explorer');
  await expect(page.getByText('Labels & certifications', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const stored = localStorage.getItem('bertel-rq-cache');
    if (!stored) return false;
    const cache = JSON.parse(stored);
    return cache.clientState?.queries?.some(
      (query: { queryKey: unknown[] }) => query.queryKey[0] === 'explorer-references',
    ) === true;
  })).toBe(true);

  await page.reload();
  await expect(page.getByText('Labels & certifications', { exact: true })).toBeVisible();

  const hydrationIssues = [...consoleErrors, ...pageErrors].filter(
    (message) => /hydrat/i.test(message) || /did not match/i.test(message),
  );
  expect(hydrationIssues).toEqual([]);
});

// Le mode compact s'applique jusqu'à 1180px ; vérifier le premier pixel du bureau.
for (const width of [1181, 1280]) {
  test(`les commandes carte ne se chevauchent pas en Split à ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/explorer');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    const tools = page.getByRole('toolbar', { name: 'Outils carte' });
    const background = page.getByRole('group', { name: 'Fond de carte' });
    await expect(tools).toBeVisible();
    await expect(background).toBeVisible();
    const a = await tools.boundingBox();
    const b = await background.boundingBox();
    if (!a || !b) throw new Error('Commandes carte sans dimensions');
    const horizontalOverlap = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
    const verticalOverlap = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
    expect(horizontalOverlap <= 0 || verticalOverlap <= 0).toBe(true);
    const title = page.getByRole('heading', { name: 'Hotel Basalte & Lagon', exact: true });
    await expect(title).toBeVisible();
    expect((await title.boundingBox())?.height).toBeGreaterThanOrEqual(17);
  });
}
