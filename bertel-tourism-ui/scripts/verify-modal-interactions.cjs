const assert = require('node:assert/strict');
const { chromium, expect } = require('@playwright/test');

// Exercise the real local components with fixture-only actions, without an authenticated backend.
const origin = new URL(process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6117').origin;
const viewports = { desktop: { width: 1440, height: 1000 }, mobile: { width: 390, height: 844 } };
const errors = [];

async function locked(page, value) {
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden')).toBe(value);
}

async function focusInside(dialog) {
  assert(await dialog.evaluate(element => element.contains(document.activeElement)), 'Focus escaped the active dialog');
}

async function run(page, story, scenario) {
  await page.goto(`${origin}/iframe.html?id=interface-modales--${story}&viewMode=story`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('dialog').last().waitFor();
  await scenario();
}

(async () => {
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: process.env.CHROME_EXECUTABLE } : {}) });
  let passed = 0;
  try {
    for (const [device, viewport] of Object.entries(viewports)) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce' });
      page.on('pageerror', error => errors.push(error.message));
      for (const story of ['application', 'application-drawer', 'crm', 'crm-drawer', 'editor']) {
        await run(page, story, async () => {
          const dialog = page.getByRole('dialog');
          await focusInside(dialog);
          await locked(page, true);
          for (let count = 0; count < 12; count++) { await page.keyboard.press('Tab'); await focusInside(dialog); }
          for (let count = 0; count < 12; count++) { await page.keyboard.press('Shift+Tab'); await focusInside(dialog); }
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await locked(page, false);
          const opener = page.getByRole('button').first();
          await opener.click();
          await dialog.waitFor();
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect(opener).toBeFocused();
          // On mobile a full-width drawer has no outside surface to click.
          if (!(device === 'mobile' && story.endsWith('drawer'))) {
            await opener.click();
            await dialog.waitFor();
            await page.mouse.click(2, 2);
            await expect(dialog).toHaveCount(0);
            await locked(page, false);
          }
        });
        console.log(JSON.stringify({ device, story, status: 'passed' }));
        passed++;
      }
      await run(page, 'confirmation', async () => {
        const child = page.getByRole('dialog', { name: 'Supprimer cette période ?' });
        await focusInside(child);
        await page.keyboard.press('Escape');
        await expect(child).toHaveCount(0);
        const parent = page.getByRole('dialog', { name: 'Modifier la période' });
        await expect(parent).toBeVisible();
        await focusInside(parent);
        await locked(page, true);
        await page.keyboard.press('Escape');
        await expect(parent).toHaveCount(0);
        await locked(page, false);
      });
      passed++;
      for (const story of ['application-with-editor', 'crm-with-editor']) {
        await run(page, story, async () => {
          const opener = page.getByRole('button', { name: 'Modifier une période', exact: true });
          await opener.click();
          const child = page.getByRole('dialog', { name: 'Période depuis une autre fenêtre' });
          await child.waitFor();
          await child.getByRole('textbox').click(); // Also proves the parent backdrop does not cover the child.
          await focusInside(child);
          await page.keyboard.press('Escape');
          await expect(child).toHaveCount(0);
          await expect(opener).toBeFocused();
          await locked(page, true);
          await page.keyboard.press('Escape');
          await expect(page.getByRole('dialog')).toHaveCount(0);
          await locked(page, false);
        });
        console.log(JSON.stringify({ device, story, status: 'passed' }));
        passed++;
      }
      await run(page, 'sheet-with-crm', async () => {
        const crm = page.getByRole('dialog', { name: 'Fiche prestataire' });
        await crm.getByRole('textbox').fill('Camille – brouillon conservé');
        const opener = crm.getByRole('button', { name: 'Demander confirmation' });
        await opener.click();
        const confirmation = page.getByRole('dialog', { name: 'Confirmer l’action' });
        await confirmation.getByRole('button', { name: 'Annuler' }).click();
        await expect(confirmation).toHaveCount(0);
        await expect(opener).toBeFocused();
        await expect(crm.getByRole('textbox')).toHaveValue('Camille – brouillon conservé');
        await locked(page, true);
        await page.keyboard.press('Escape');
        await expect(crm).toHaveCount(0);
        await expect(page.getByRole('dialog', { name: 'Suivi CRM' })).toBeVisible();
        await locked(page, true);
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog')).toHaveCount(0);
        await locked(page, false);
      });
      passed++;
      await page.close();
    }
    assert.deepEqual(errors, [], 'Browser JavaScript errors');
    console.log(JSON.stringify({ scenarios: passed, status: 'passed', browserErrors: errors.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
