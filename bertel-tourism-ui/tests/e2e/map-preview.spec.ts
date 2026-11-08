import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { dispatchNativeHoverAfterEntry } from './helpers/native-mouse-pair';
import { startFocusJournal } from './helpers/focus-journal';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.describe.configure({ retries: 0 });

const focusJournals = new WeakMap<Page, Awaited<ReturnType<typeof startFocusJournal>>>();
test.afterEach(async ({ page }, testInfo) => {
  const journal = focusJournals.get(page);
  if (!journal) return;
  try {
    await journal.checkpoint(`test-${testInfo.status}`);
    await testInfo.attach('map-focus-journal', {
      body: JSON.stringify(await journal.snapshot(), null, 2), contentType: 'application/json',
    });
  } finally {
    focusJournals.delete(page);
    await journal.dispose();
  }
});

async function offlineExplorer(page: Page, testInfo: TestInfo, pathname = '/explorer') {
    const origin = new URL(testInfo.project.use.baseURL as string).origin;
    const unexpected: string[] = [];
    const errors: string[] = [];
    await page.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if ((url.origin === 'https://tiles.openfreemap.org' && url.pathname.startsWith('/styles/'))
        || (url.origin === 'https://demotiles.maplibre.org' && url.pathname === '/style.json')) {
        return route.fulfill({ json: { version: 8, sources: {}, layers: [
          { id: 'background', type: 'background', paint: { 'background-color': '#dce7e2' } },
        ] } });
      }
      if (url.origin === 'https://images.unsplash.com' && route.request().resourceType() === 'image') {
        return route.fulfill({ contentType: 'image/svg+xml', body:
          '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="120"><rect width="260" height="120" fill="#427a78"/></svg>' });
      }
      unexpected.push(url.href);
      return route.abort();
    });
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(pathname);
    await page.locator('time[datetime]').first().waitFor({ state: 'attached' });
    focusJournals.set(page, await startFocusJournal(page));
    return { errors, unexpected };
}

for (const width of [320, 390, 768, 1180]) {
  test(`map preview opens the same object with mouse and keyboard at ${width}px`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width, height: 900 });
    const { errors, unexpected } = await offlineExplorer(page, testInfo);
    // The datetime attribute appears after the real layout hydrates. Filter via
    // the real search control to a demo object with a complete drawer fixture,
    // rather than a marker-only draft whose existing demo detail is unknown.
    await page.getByRole('combobox', { name: 'Rechercher une fiche' }).fill('Hotel Basalte');
    await expect(page.locator('.explorer-result-card')).toHaveCount(1);
    await page.getByRole('button', { name: 'Carte', exact: true }).click();
    const pin = page.locator('.map-marker-pin').first();
    await expect(pin).toBeVisible({ timeout: 20_000 });
    const name = (await pin.getAttribute('aria-label'))!.replace(/^Ouvrir /, '');
    await pin.hover();
    const preview = page.getByRole('article', { name, exact: true });
    const heading = preview.getByRole('heading', { level: 3, name, exact: true });
    const open = preview.getByRole('button', { name: `Ouvrir la fiche ${name}`, exact: true });
    const close = preview.getByRole('button', { name: `Fermer l’aperçu de ${name}`, exact: true });
    await expect(heading).toBeVisible();
    await expect(preview.locator('img')).toBeVisible();
    const bounds = await preview.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
    const targets = await Promise.all([open, close].map(control => control.boundingBox()));
    for (const target of targets) {
      expect(target!.height).toBeGreaterThanOrEqual(44);
      expect(target!.width).toBeGreaterThanOrEqual(44);
    }
    const titleBounds = await heading.boundingBox();
    expect(targets[0]!.y).toBeGreaterThanOrEqual(titleBounds!.y + titleBounds!.height);
    await expect(open).toHaveClass(/primary-button/);
    await page.screenshot({ path: testInfo.outputPath(`map-preview-${width}.png`) });
    // A real click also proves the close target is not covered by map controls
    // at narrow widths; visibility and 44px bounds alone cannot prove this.
    await close.click();
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    await pin.hover();
    await expect(open).toBeVisible();
    // Real pointer action opens the existing drawer for the previewed object.
    await open.click();
    await expect(preview).toHaveCount(0);
    const drawer = page.locator('.drawer-panel');
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    await drawer.getByRole('button', { name: 'Fermer', exact: true }).click();
    await expect(drawer).toHaveCount(0);

    // A fresh focus entry avoids a no-op on a pin already focused by close.
    // Observe the product's pin -> async CTA autofocus before testing Tab/return.
    const journal = focusJournals.get(page)!;
    await journal.checkpoint('drawer-closed');
    await page.mouse.move(1, 1);
    const search = page.getByRole('combobox', { name: 'Rechercher une fiche' });
    await search.focus();
    await expect(search).toBeFocused();
    await journal.checkpoint('search-origin');
    await pin.focus();
    await journal.checkpoint('pin-focus-requested');
    await expect(open).toBeFocused();
    await journal.checkpoint('cta-autofocus-before-tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await journal.checkpoint('cta-after-tab-return');
    await page.mouse.move(1, 1);
    if (width === 1180) {
      // Cross the existing 3s minimum-visible/grace deadline with the action
      // focused; focus must keep the preview alive after the pointer leaves.
      await page.waitForTimeout(3300);
      await expect(open).toBeFocused();
      await journal.checkpoint('cta-after-grace');
    }
    await page.keyboard.press('Escape');
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    // Return focus through real Tab/Shift+Tab so closing does not itself reopen.
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveCount(0);
    await expect(pin).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Shift+Tab');
    await expect(open).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(preview).toHaveCount(0);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
    expect(unexpected).toEqual([]);
    expect(errors).toEqual([]);
  });
}

test('an unfinished hover of B preserves the displayed A preview focus owner', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1180, height: 900 });
  // The real URL accessibility filter selects exactly two existing demo cards.
  const { errors, unexpected } = await offlineExplorer(page, testInfo, '/explorer?pmr=true');
  await expect(page.locator('.explorer-result-card')).toHaveCount(2);
  await page.getByRole('button', { name: 'Carte', exact: true }).click();
  const pins = page.locator('.map-marker-pin');
  await expect(pins).toHaveCount(2, { timeout: 20_000 });
  const a = pins.first();
  const nameA = (await a.getAttribute('aria-label'))!.replace(/^Ouvrir /, '');
  await page.mouse.move(1, 1);
  // Enter the pin through real Tab/Shift+Tab, then wait for keyboard focus on A's
  // actual primary action before introducing the unrelated pointer excursion.
  await a.focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Shift+Tab');
  const previewA = page.getByRole('article', { name: nameA, exact: true });
  const actionA = previewA.getByRole('button', { name: `Ouvrir la fiche ${nameA}`, exact: true });
  await expect(actionA).toBeFocused();
  await focusJournals.get(page)!.checkpoint('A-cta-before-B-input');
  await expect(actionA).toHaveCSS('outline-width', '2px');
  await expect(actionA).toHaveCSS('outline-offset', '2px');
  const bounds = (await previewA.boundingBox())!;
  let b = pins.nth(1);
  let found = false;
  for (let index = 1; index < await pins.count(); index += 1) {
    const candidate = pins.nth(index);
    const box = await candidate.boundingBox();
    if (!box) continue;
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    if (box.x > 16 && box.x + box.width < 1164 && y > 0 && y < 900
      && !(x >= bounds.x && x <= bounds.x + bounds.width && y >= bounds.y && y <= bounds.y + bounds.height)) {
      b = candidate; found = true; break;
    }
  }
  expect(found).toBe(true);
  const nameB = (await b.getAttribute('aria-label'))!.replace(/^Ouvrir /, '');
  expect(nameB).not.toBe(nameA);
  const boxB = (await b.boundingBox())!;
  const yB = boxB.y + boxB.height / 2;
  await page.mouse.move(boxB.x - 8, yB);
  await b.evaluate(element => {
    element.addEventListener('pointerenter', event => {
      element.setAttribute('data-ui06-enter', String(event.timeStamp));
      element.setAttribute('data-ui06-enter-trusted', String(event.isTrusted));
      element.setAttribute('data-ui06-order', 'enter');
      element.setAttribute('data-ui06-enter-handled', String(performance.now()));
    }, { once: true });
    element.addEventListener('pointerleave', event => {
      element.setAttribute('data-ui06-leave', String(event.timeStamp));
      element.setAttribute('data-ui06-leave-trusted', String(event.isTrusted));
      element.setAttribute('data-ui06-order', `${element.getAttribute('data-ui06-order') ?? ''},leave`);
      element.setAttribute('data-ui06-leave-handled', String(performance.now()));
    }, { once: true });
  });
  // The trusted native entry notification submits the exit without waiting
  // for the first movement ACK. A slow observer/browser still fails <250ms.
  const input = await page.context().newCDPSession(page);
  try {
    const native = await dispatchNativeHoverAfterEntry(input, b,
      { x: boxB.x + boxB.width / 2, y: yB }, { x: boxB.x + boxB.width + 8, y: yB });
    expect(native.entryNotifications).toBe(1);
    expect(await page.evaluate(name => typeof (globalThis as unknown as Record<string, unknown>)[name], native.bindingName)).toBe('undefined');
  } finally {
    await input.detach();
  }
  await page.mouse.move(1, 1);
  const marks = await b.evaluate(element => ({ enter: element.getAttribute('data-ui06-enter'), leave: element.getAttribute('data-ui06-leave'),
    enterTrusted: element.getAttribute('data-ui06-enter-trusted'), leaveTrusted: element.getAttribute('data-ui06-leave-trusted'),
    order: element.getAttribute('data-ui06-order'), enterHandled: element.getAttribute('data-ui06-enter-handled'), leaveHandled: element.getAttribute('data-ui06-leave-handled') }));
  expect(marks.enter).not.toBeNull();
  expect(marks.leave).not.toBeNull();
  expect(marks.enterTrusted).toBe('true');
  expect(marks.leaveTrusted).toBe('true');
  expect(marks.order).toBe('enter,leave');
  const dwell = Number(marks.leave) - Number(marks.enter);
  const handledDwell = Number(marks.leaveHandled) - Number(marks.enterHandled);
  // Emit both real measures before a failed precondition can hide the second.
  console.log(JSON.stringify({ mapBriefHoverPrecondition: { dwell, handledDwell,
    inputOrder: marks.order, enterTrusted: marks.enterTrusted, leaveTrusted: marks.leaveTrusted } }));
  expect(dwell).toBeGreaterThanOrEqual(0);
  expect(dwell).toBeLessThan(250);
  expect(handledDwell).toBeGreaterThanOrEqual(0);
  expect(handledDwell).toBeLessThan(250);
  // Cross the existing hover-intent threshold: B must never become displayed.
  await page.waitForTimeout(300);
  await expect(actionA).toBeFocused();
  await expect(page.getByRole('article', { name: nameB, exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(previewA).toHaveCount(0);
  const returned = await page.evaluate(() => document.activeElement?.getAttribute('aria-label'));
  console.log(JSON.stringify({ mapPreviewTriggerProof: { nameA, nameB, dwell, handledDwell, inputOrder: marks.order, returned } }));
  await expect(a).toBeFocused();
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});

test('map preview actions remain clickable where the real legend overlaps', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1706, height: 710 });
  const { errors, unexpected } = await offlineExplorer(page, testInfo);
  await page.getByRole('combobox', { name: 'Rechercher une fiche' }).fill('Hotel Basalte');
  await expect(page.locator('.explorer-result-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  const pin = page.locator('.map-marker-pin').first();
  await expect(pin).toBeVisible({ timeout: 20_000 });
  const legend = page.getByRole('group', { name: 'Légende des types', exact: true });
  const legendBounds = (await legend.boundingBox())!;
  const canvasBounds = (await page.locator('.maplibregl-canvas').boundingBox())!;
  expect(legendBounds.y + legendBounds.height).toBeLessThanOrEqual(710);
  // Pan the real MapLibre canvas, keeping the marker on screen. The preview
  // then crosses the existing bottom-left legend, as observed in production.
  const destination = { x: legendBounds.x + 135, y: legendBounds.y + 115 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bounds = (await pin.boundingBox())!;
    const dx = destination.x - (bounds.x + bounds.width / 2);
    const dy = destination.y - (bounds.y + bounds.height / 2);
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
    const start = {
      x: dx < 0 ? canvasBounds.x + canvasBounds.width - 100 : canvasBounds.x + 100,
      y: dy > 0 ? canvasBounds.y + 80 : canvasBounds.y + canvasBounds.height - 80,
    };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'), start)).toBe(true);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
    // Holding after the drag avoids a fling moving the marker after release.
    await page.waitForTimeout(200);
    await page.mouse.up();
  }
  await expect.poll(async () => {
    const bounds = (await pin.boundingBox())!;
    return Math.hypot(bounds.x + bounds.width / 2 - destination.x, bounds.y + bounds.height / 2 - destination.y);
  }).toBeLessThan(5);
  const name = (await pin.getAttribute('aria-label'))!.replace(/^Ouvrir /, '');
  // The pin is intentionally behind the legend. Keyboard focus opens the
  // preview without requiring a pointer to pass through the legend first.
  await pin.focus();
  const preview = page.getByRole('article', { name, exact: true });
  const open = preview.getByRole('button', { name: `Ouvrir la fiche ${name}`, exact: true });
  const close = preview.getByRole('button', { name: `Fermer l’aperçu de ${name}`, exact: true });
  await expect(open).toBeVisible();
  const openBounds = (await open.boundingBox())!;
  // Require a genuine overlap; a passing check elsewhere on the map is not
  // evidence that the legend no longer intercepts the action's hit target.
  expect(Math.min(openBounds.x + openBounds.width, legendBounds.x + legendBounds.width)
    - Math.max(openBounds.x, legendBounds.x)).toBeGreaterThan(44);
  expect(Math.min(openBounds.y + openBounds.height, legendBounds.y + legendBounds.height)
    - Math.max(openBounds.y, legendBounds.y)).toBeGreaterThan(20);
  await page.screenshot({ path: testInfo.outputPath('map-preview-overlapping-legend.png') });
  for (const control of [open, close]) {
    const hits = await control.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return [8, rect.width / 2, rect.width - 8].flatMap(x => [8, rect.height / 2, rect.height - 8].map(y => {
        const top = document.elementFromPoint(rect.x + x, rect.y + y);
        return top === element || element.contains(top);
      }));
    });
    expect(hits).toEqual(Array(9).fill(true));
  }
  // This point was covered by the legend before the stacking correction.
  await open.click({ position: { x: 8, y: openBounds.height - 8 } });
  await expect(preview).toHaveCount(0);
  const drawer = page.locator('.drawer-panel');
  await expect(drawer.getByRole('heading', { level: 1, name, exact: true })).toBeVisible();
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
});
