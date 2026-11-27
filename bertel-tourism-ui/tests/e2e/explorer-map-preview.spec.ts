import { expect, test, type Page, type TestInfo } from '@playwright/test';

test.use({
  viewport: { width: 1600, height: 1000 },
  launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
});

async function openOfflineExplorer(page: Page, testInfo: TestInfo) {
  const origin = new URL(testInfo.project.use.baseURL as string).origin;
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // A local, deterministic map style keeps this interaction check independent of tile services.
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.pathname.includes('/styles/') || url.pathname.endsWith('/style.json')) {
      return route.fulfill({ json: {
        version: 8, sources: {},
        layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e4ece6' } }],
      } });
    }
    if (route.request().resourceType() === 'image') {
      return route.fulfill({ contentType: 'image/svg+xml', body:
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="#d5e3dd"/></svg>' });
    }
    return route.abort();
  });

  await page.goto('/explorer');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(page.locator('.map-panel canvas.maplibregl-canvas')).toBeVisible();
  return errors;
}

async function readVisibleGlyphGap(page: Page) {
  return page.evaluate(() => {
    const active = document.querySelector('.map-marker-pin--active');
    const popup = document.querySelector('.map-hover-popup');
    const tip = popup?.querySelector('.maplibregl-popup-tip');
    if (!active || !popup || !tip) return null;
    const marker = active.getBoundingClientRect();
    const arrow = tip.getBoundingClientRect();
    // The 64×80 marker PNG has transparent margins. object-fit:contain preserves
    // these proportions inside the square button; measure the visible glyph, not its hit area.
    const glyph = {
      top: marker.top + 0.05 * marker.height,
      bottom: marker.top + 0.8125 * marker.height,
      left: marker.left + 0.2125 * marker.width,
      right: marker.left + 0.7875 * marker.width,
    };
    const anchor = Array.from(popup.classList).find((name) => name.startsWith('maplibregl-popup-anchor-')) ?? '';
    const gap = anchor.includes('-anchor-top') ? arrow.top - glyph.bottom
      : anchor.includes('-anchor-bottom') ? glyph.top - arrow.bottom
      : anchor.endsWith('-anchor-left') ? arrow.left - glyph.right
      : glyph.left - arrow.right;
    return { gap, width: marker.width, anchor };
  });
}

test('links sustained result hover and selection to the actual map popup', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = await openOfflineExplorer(page, testInfo);
  const result = page.locator('#result-card-HOTRUN0000000001');
  await expect(result).toBeVisible();
  const popup = page.locator('.map-hover-popup');
  await page.evaluate(() => {
    const panel = document.querySelector('.map-panel')!;
    const proof = { properties: [] as string[], sample: null as null | {
      opacity: string; transform: string; popupAnimations: number; wrapAnimations: number;
      popupTransition: string; wrapTransition: string;
    } };
    (window as unknown as { mapPreviewEntryProof: typeof proof }).mapPreviewEntryProof = proof;
    const recordTransition = (event: Event) => {
      if (!(event instanceof TransitionEvent) || !(event.target instanceof Element)
        || !['entering', 'open'].includes(panel.getAttribute('data-map-preview-phase') ?? '')) return;
      if (event.target.matches('.map-hover-popup')) proof.properties.push(`popup:${event.propertyName}`);
      if (event.target.matches('.map-hover-card-wrap')) proof.properties.push(`wrap:${event.propertyName}`);
    };
    // CSS can dispatch the run notification before the next-frame phase reaches
    // "open". Capture both native entry notifications before descendants can stop them.
    panel.addEventListener('transitionrun', recordTransition, true);
    panel.addEventListener('transitionstart', recordTransition, true);
    let scheduled = false;
    const observer = new MutationObserver(() => {
      if (scheduled || panel.getAttribute('data-map-preview-phase') !== 'open') return;
      const popup = panel.querySelector('.map-hover-popup');
      const wrap = popup?.querySelector('.map-hover-card-wrap');
      if (!popup || !wrap) return;
      scheduled = true;
      requestAnimationFrame(() => {
        proof.sample = { opacity: getComputedStyle(popup).opacity, transform: getComputedStyle(wrap).transform,
          popupAnimations: popup.getAnimations().length, wrapAnimations: wrap.getAnimations().length,
          popupTransition: getComputedStyle(popup).transitionProperty,
          wrapTransition: getComputedStyle(wrap).transitionProperty };
        observer.disconnect();
      });
    });
    observer.observe(panel, { subtree: true, attributes: true, childList: true });
  });
  await result.hover();
  await page.waitForTimeout(200);
  await expect(popup).not.toBeVisible();

  const list = result.locator('..');
  // Await the real native scroll before checking the resulting preview. Exact
  // 999/1000 ms reset boundaries are covered with fake timers in the unit tests.
  await list.evaluate((element) => new Promise<void>((resolve) => {
    const maxScroll = element.scrollHeight - element.clientHeight;
    if (maxScroll <= 0) throw new Error('The result list must scroll for this check');
    element.addEventListener('scroll', () => resolve(), { once: true });
    element.scrollTop = element.scrollTop < maxScroll
      ? Math.min(element.scrollTop + 15, maxScroll)
      : Math.max(element.scrollTop - 15, 0);
  }));
  await expect(popup).toBeVisible({ timeout: 2500 });
  await expect(page.locator('.map-panel')).toHaveAttribute('data-map-preview-phase', 'open');
  await expect(popup.locator('.map-hover-card__name')).toHaveText('Hotel Basalte & Lagon');
  const activePin = page.locator('.map-marker-pin--active');
  await expect(activePin).toHaveCount(1);
  await expect(activePin).toHaveAccessibleName('Ouvrir Hotel Basalte & Lagon');
  await expect(activePin).toBeVisible();
  await expect.poll(() => activePin.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(48);
  await expect.poll(async () => Math.abs(((await readVisibleGlyphGap(page))?.gap ?? Infinity) - 6)).toBeLessThan(1.5);
  const mutedMarkers = page.locator('.map-marker-pin--muted, .map-cluster-pin--muted');
  await expect.poll(() => mutedMarkers.count()).toBeGreaterThan(0);
  const expectedMutedStyles = await mutedMarkers.evaluateAll((elements) => elements.map((element) => {
    const cluster = element.classList.contains('map-cluster-pin');
    return { opacity: '1', normalOpacity: '0', mutedOpacity: cluster ? '0.65' : '0.6',
      pointerEvents: 'auto', counterOpacity: cluster ? '1' : null };
  }));
  await expect.poll(() => mutedMarkers.evaluateAll((elements) => elements.map((element) => {
    const cluster = element.classList.contains('map-cluster-pin');
    const normal = element.querySelector(cluster ? '.map-cluster-pin__ring:not(.map-cluster-pin__ring--muted)' : '.map-marker-pin__img')!;
    const muted = element.querySelector(cluster ? '.map-cluster-pin__ring--muted' : '.map-marker-pin__muted-img')!;
    const count = element.querySelector('.map-cluster-pin__count');
    return { opacity: getComputedStyle(element).opacity, normalOpacity: getComputedStyle(normal).opacity,
      mutedOpacity: getComputedStyle(muted).opacity, pointerEvents: getComputedStyle(element).pointerEvents,
      counterOpacity: count ? getComputedStyle(count).opacity : null };
  }))).toEqual(expectedMutedStyles);
  expect(await mutedMarkers.evaluateAll((elements) => elements.every((element) => {
    const visual = element.querySelector('.map-marker-pin__muted-img, .map-cluster-pin__ring--muted')!;
    return getComputedStyle(visual).filter.includes('grayscale(1)');
  }))).toBe(true);
  await expect.poll(() => page.evaluate(() => (window as unknown as {
    mapPreviewEntryProof: { properties: string[] };
  }).mapPreviewEntryProof.properties)).toEqual(expect.arrayContaining(['popup:opacity', 'wrap:transform']));
  const entryProof = await page.evaluate(() => (window as unknown as {
    mapPreviewEntryProof: { properties: string[]; sample: { popupTransition: string; wrapTransition: string } | null };
  }).mapPreviewEntryProof);
  console.log(JSON.stringify({ mapPreviewEntryProof: entryProof }));
  expect(entryProof.sample?.popupTransition).toContain('opacity');
  expect(entryProof.sample?.wrapTransition).toContain('transform');
  expect(await activePin.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
  })).toBe(true);
  await expect(page.locator('.map-marker-pin[aria-label="Ouvrir Hotel Basalte & Lagon"]')).toHaveCount(1);
  await expect(result).not.toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('explorer-map-preview.png') });

  // Observe the transient closing state in the browser, without racing its 180 ms exit over IPC.
  await page.evaluate(() => {
    const panel = document.querySelector('.map-panel')!;
    const observation = { phase: '', inert: false, ariaHidden: '', popupPointerEvents: '', contentPointerEvents: '',
      popupTransition: '', popupDuration: '', wrapTransition: '', wrapDuration: '' };
    (window as unknown as { mapPreviewExitProof: typeof observation }).mapPreviewExitProof = observation;
    const observer = new MutationObserver(() => {
      if (panel.getAttribute('data-map-preview-phase') !== 'exiting') return;
      const wrapper = panel.querySelector('.map-hover-card-wrap');
      observation.phase = 'exiting';
      observation.inert = Boolean(wrapper?.hasAttribute('inert'));
      observation.ariaHidden = wrapper?.getAttribute('aria-hidden') ?? '';
      const popup = panel.querySelector('.map-hover-popup')!;
      const content = popup.querySelector('.maplibregl-popup-content')!;
      observation.popupPointerEvents = getComputedStyle(popup).pointerEvents;
      observation.contentPointerEvents = getComputedStyle(content).pointerEvents;
      observation.popupTransition = getComputedStyle(popup).transitionProperty;
      observation.popupDuration = getComputedStyle(popup).transitionDuration;
      observation.wrapTransition = getComputedStyle(wrapper!).transitionProperty;
      observation.wrapDuration = getComputedStyle(wrapper!).transitionDuration;
      observer.disconnect();
    });
    observer.observe(panel, { subtree: true, attributes: true, childList: true });
  });
  await page.keyboard.press('Escape');
  await expect(page.locator('.map-panel')).toHaveAttribute('data-map-preview-phase', 'closed');
  await expect(popup).toHaveCount(0);
  const exitProof = await page.evaluate(() => (window as unknown as { mapPreviewExitProof: {
    phase: string; inert: boolean; ariaHidden: string; popupPointerEvents: string; contentPointerEvents: string;
    popupTransition: string; popupDuration: string; wrapTransition: string; wrapDuration: string;
  } }).mapPreviewExitProof);
  expect(exitProof).toMatchObject({ phase: 'exiting', inert: true, ariaHidden: 'true',
    popupPointerEvents: 'none', contentPointerEvents: 'none' });
  expect(exitProof.popupTransition).toContain('opacity');
  expect(exitProof.wrapTransition).toContain('transform');
  expect(exitProof.popupDuration.split(',').some((value) => parseFloat(value) > 0)).toBe(true);
  expect(exitProof.wrapDuration.split(',').some((value) => parseFloat(value) > 0)).toBe(true);
  await testInfo.attach('map-preview-motion-proof', { body: JSON.stringify({ entryProof, exitProof }), contentType: 'application/json' });
  await expect(mutedMarkers).toHaveCount(0);
  await result.getByRole('button', { name: 'Ajouter a la selection', exact: true }).click();
  await expect(popup).toBeVisible({ timeout: 1500 });
  await expect(popup.locator('.map-hover-card__name')).toHaveText('Hotel Basalte & Lagon');
  await expect(page.getByRole('button', { name: 'Retirer de la selection', exact: true })).toBeVisible();
  await expect(page.locator('.drawer-panel')).not.toBeVisible();

  // A keyboard preview leaves focus on the result, rather than MapLibre stealing it.
  await page.keyboard.press('Escape');
  await page.mouse.move(100, 50);
  await result.focus();
  await expect(popup).toBeVisible({ timeout: 2500 });
  await expect(popup.locator('.map-hover-card__name')).toHaveText('Hotel Basalte & Lagon');
  await expect(result).toBeFocused();
  expect(errors).toEqual([]);
});

test('keeps the popup tip six pixels from the visible glyph above and below with reduced motion', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  // Reduced motion keeps the pin at its original size and skips transitions.
  // The six-pixel visual gap must still hold on both sides of that smaller glyph.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = await openOfflineExplorer(page, testInfo);
  await page.getByRole('combobox', { name: 'Rechercher une fiche' }).fill('Hotel Basalte');
  await expect(page.locator('.explorer-result-card')).toHaveCount(1);
  const pin = page.locator('.map-marker-pin[aria-label="Ouvrir Hotel Basalte & Lagon"]');
  await expect(pin).toBeVisible();
  await pin.focus();
  const popup = page.locator('.map-hover-popup');
  const panel = page.locator('.map-panel');
  await expect(panel).toHaveAttribute('data-map-preview-phase', 'open');
  await expect(popup).toHaveClass(/maplibregl-popup-anchor-bottom(?:\s|$)/);

  await expect.poll(async () => Math.abs(((await readVisibleGlyphGap(page))?.gap ?? Infinity) - 6)).toBeLessThan(1.5);
  expect((await readVisibleGlyphGap(page))!.width).toBeCloseTo(38, 1);

  await page.keyboard.press('Escape');
  await expect(panel).toHaveAttribute('data-map-preview-phase', 'closed');
  await expect(popup).toHaveCount(0);
  const canvas = page.locator('.map-panel canvas.maplibregl-canvas');
  const canvasBounds = (await canvas.boundingBox())!;
  const destination = { x: canvasBounds.x + canvasBounds.width / 2, y: canvasBounds.y + 60 };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const bounds = (await pin.boundingBox())!;
    const dx = destination.x - (bounds.x + bounds.width / 2);
    const dy = destination.y - (bounds.y + bounds.height / 2);
    if (Math.abs(dx) < 3 && Math.abs(dy) < 3) break;
    const start = { x: canvasBounds.x + canvasBounds.width - 100, y: canvasBounds.y + canvasBounds.height - 80 };
    expect(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.classList.contains('maplibregl-canvas'), start)).toBe(true);
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    await page.mouse.move(start.x + dx, start.y + dy, { steps: 12 });
    await page.waitForTimeout(200); // Let the drag stop before release, avoiding a fling.
    await page.mouse.up();
  }
  await expect.poll(async () => {
    const bounds = (await pin.boundingBox())!;
    return Math.hypot(bounds.x + bounds.width / 2 - destination.x, bounds.y + bounds.height / 2 - destination.y);
  }).toBeLessThan(8);
  await pin.focus();
  await expect(panel).toHaveAttribute('data-map-preview-phase', 'open');
  await expect(popup).toHaveClass(/maplibregl-popup-anchor-top(?:\s|$)/);
  await expect.poll(async () => Math.abs(((await readVisibleGlyphGap(page))?.gap ?? Infinity) - 6)).toBeLessThan(1.5);
  expect((await readVisibleGlyphGap(page))!.width).toBeCloseTo(38, 1);
  expect(errors).toEqual([]);
});

test('returns keyboard focus to the map when a temporary cluster marker exits', async ({ page }, testInfo) => {
  test.setTimeout(90_000);
  const errors = await openOfflineExplorer(page, testInfo);
  const panel = page.locator('.map-panel');
  const canvas = panel.locator('canvas.maplibregl-canvas');
  const result = page.locator('#result-card-HOTRUN0000000001');
  await expect(result).toBeVisible();
  // Zoom through the real map controls until the result has no individual pin.
  // The ensuing result hover must promote a temporary marker from its cluster.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (await panel.locator('.map-marker-pin').count() === 0
      && await panel.locator('.map-cluster-pin').count() > 0) break;
    await panel.locator('.maplibregl-ctrl-zoom-out').click();
    await page.waitForTimeout(350);
  }
  await expect(panel.locator('.map-marker-pin')).toHaveCount(0);
  await expect.poll(() => panel.locator('.map-cluster-pin').count()).toBeGreaterThan(0);
  await result.hover();
  const overlay = panel.locator('.map-marker-pin[data-preview-overlay="true"]');
  await expect(overlay).toHaveAccessibleName('Ouvrir Hotel Basalte & Lagon');
  await expect(panel).toHaveAttribute('data-map-preview-phase', 'open');
  await page.mouse.move(100, 50);
  await overlay.focus();
  const action = panel.getByRole('button', { name: 'Ouvrir la fiche Hotel Basalte & Lagon', exact: true });
  await expect(action).toBeFocused();

  await page.keyboard.press('Escape');

  await expect(canvas).toBeFocused();
  await expect(panel).toHaveAttribute('data-map-preview-phase', 'closed');
  await expect(overlay).toHaveCount(0);
  await expect(canvas).toBeFocused();
  await expect(panel.locator('.map-cluster-pin--muted')).toHaveCount(0);
  expect(errors).toEqual([]);
});
