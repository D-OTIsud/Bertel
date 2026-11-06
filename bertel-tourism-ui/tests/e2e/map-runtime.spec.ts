import { expect, test } from '@playwright/test';
import sharp from 'sharp';

test.use({ launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] } });
test.describe.configure({ retries: 0 });

for (const webgl1Only of [false, true]) {
  test(`the installed map renders and zooms with ${webgl1Only ? 'WebGL1 fallback' : 'WebGL2'}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    if (webgl1Only) {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value:
          function (this: HTMLCanvasElement, kind: string, ...args: unknown[]) {
            // Simulate a device without WebGL2; WebGL1 remains the real browser
            // implementation. No MapLibre renderer or worker is substituted.
            return kind === 'webgl2' ? null : Reflect.apply(original, this, [kind, ...args]);
          } });
      });
    }
    const style = { version: 8, sources: {
      fixture: { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: {
        type: 'Polygon', coordinates: [[[55.4, -21.35], [55.6, -21.35], [55.6, -21.1], [55.4, -21.1], [55.4, -21.35]]],
      } } },
    }, layers: [
      { id: 'background', type: 'background', paint: { 'background-color': '#dce7e2' } },
      { id: 'fixture', type: 'fill', source: 'fixture', paint: { 'fill-color': '#d01b50' } },
    ] };
    const origin = new URL(testInfo.project.use.baseURL as string).origin;
    const errors: string[] = [];
    const unexpectedRequests: string[] = [];
    const workers: string[] = [];
    let styleLoads = 0;
    await page.route('**/*', async (route) => {
      const url = new URL(route.request().url());
      if (url.origin === origin) return route.continue();
      if ((url.origin === 'https://tiles.openfreemap.org' && url.pathname.startsWith('/styles/'))
        || (url.origin === 'https://demotiles.maplibre.org' && url.pathname === '/style.json')) {
        styleLoads += 1;
        return route.fulfill({ json: style });
      }
      if (url.origin === 'https://images.unsplash.com' && route.request().resourceType() === 'image') {
        // Explorer demo thumbnails are unrelated to the map proof. Keep this
        // fixture offline instead of contacting the demo image provider.
        return route.fulfill({ contentType: 'image/svg+xml', body:
          '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>' });
      }
      unexpectedRequests.push(url.href);
      return route.abort();
    });
    page.on('worker', (worker) => workers.push(worker.url()));
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto('/explorer');
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    const canvas = page.locator('.map-panel canvas.maplibregl-canvas').first();
    await expect(canvas).toBeVisible();

    async function readRuntime() {
      return canvas.evaluate((element, fallbackOnly) => {
        type ActualMap = { getCanvas(): HTMLCanvasElement; getZoom(): number; _zoomLevelsToOverscale?: number };
        type Hook = { memoizedState?: { current?: { getMap?: () => ActualMap } }; next?: Hook };
        type Fiber = { memoizedState?: Hook; return?: Fiber };
        // Inspect the app's existing adapter ref like DevTools. This test does
        // not add an application hook or instantiate a second Map.
        const panel = element.closest('.map-panel') as HTMLElement;
        const key = Object.keys(panel).find((name) => name.startsWith('__reactFiber$'));
        let fiber = key ? (panel as unknown as Record<string, Fiber>)[key] : undefined;
        while (fiber) {
          let hook = fiber.memoizedState;
          for (let i = 0; hook && i < 200; i += 1, hook = hook.next) {
            const candidate = hook.memoizedState?.current;
            if (typeof candidate?.getMap === 'function') {
              const map = candidate.getMap();
              if (map.getCanvas() === element) {
                const actualCanvas = element as HTMLCanvasElement;
                const gl = fallbackOnly ? actualCanvas.getContext('webgl') : actualCanvas.getContext('webgl2');
                return { zoom: map.getZoom(), hasOverscale: '_zoomLevelsToOverscale' in map,
                  overscaleUndefined: map._zoomLevelsToOverscale === undefined,
                  glVersion: gl?.getParameter(gl.VERSION) as string | null,
                  drawable: Boolean(gl && !gl.isContextLost() && actualCanvas.width > 0 && actualCanvas.height > 0) };
              }
            }
          }
          fiber = fiber.return;
        }
        return null; // React may have inserted the canvas before committing its ref.
      }, webgl1Only);
    }
    // Only ref/canvas absence is pending. Context errors propagate, and a null
    // or lost GL context fails the strict assertion immediately after readiness.
    await expect.poll(async () => (await readRuntime()) !== null, { timeout: 20_000 }).toBe(true);
    async function requireRuntime() {
      const runtime = await readRuntime();
      if (runtime === null) throw new Error('The map adapter ref disappeared after readiness');
      return runtime;
    }
    const initial = await requireRuntime();
    expect(initial.drawable).toBe(true);
    expect(initial.glVersion).toMatch(webgl1Only ? /^WebGL 1\.0/ : /^WebGL 2\.0/);
    expect(initial.hasOverscale).toBe(true);
    expect(initial.overscaleUndefined).toBe(true);
    let pixels = 0;
    async function countFill() {
      const { data, info } = await sharp(await canvas.screenshot()).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      pixels = 0;
      for (let i = 0; i < data.length; i += info.channels) {
        if (data[i] === 208 && data[i + 1] === 27 && data[i + 2] === 80) pixels += 1;
      }
      return pixels;
    }
    // GeoJSON pixels require the real worker. An empty background cannot pass.
    await expect.poll(countFill, { timeout: 20_000 }).toBeGreaterThan(100);
    const beforeZoom = pixels;
    await page.locator('.map-panel .maplibregl-ctrl-zoom-in').click();
    await expect.poll(countFill).not.toBe(beforeZoom);
    await expect.poll(async () => (await requireRuntime()).zoom).toBeGreaterThan(initial.zoom);
    await expect(page.getByRole('toolbar', { name: 'Outils carte' })).toBeVisible();
    expect(styleLoads).toBeGreaterThan(0);
    expect(workers.some((url) => url.startsWith(`blob:${origin}/`))).toBe(true);
    expect(unexpectedRequests).toEqual([]);
    expect(errors).toEqual([]);
    const proof = { webgl1Only, initial, final: await requireRuntime(), beforeZoom, afterZoom: pixels,
      workers, styleLoads, errors, unexpectedRequests };
    console.log(JSON.stringify({ mapRuntimeProof: proof }));
    await testInfo.attach('map-runtime-proof', { body: JSON.stringify(proof), contentType: 'application/json' });
    await canvas.screenshot({ path: testInfo.outputPath('map-runtime.png') });
  });
}
