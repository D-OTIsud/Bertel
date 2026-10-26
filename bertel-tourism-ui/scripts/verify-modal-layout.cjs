'use strict';
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');

// Local Storybook geometry/scroll/folding checks; no authenticated or live-data writes.
// Start Storybook separately. Override STORYBOOK_URL, OUTPUT_DIR and CHROME_EXECUTABLE when needed.
const ORIGIN = new URL(process.env.STORYBOOK_URL ?? 'http://127.0.0.1:6007').origin;
const OUTPUT_DIR = path.resolve(process.env.OUTPUT_DIR ?? path.join(path.resolve(__dirname, '..'), 'outputs', 'modal-layout-check'));
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
const STORIES = [
  ['01', 'tarif', 1000], ['02', 'periode', 1000], ['03', 'exception', 1000],
  ['04', 'chambre', 1000], ['05', 'remise', 1000], ['06', 'salle', 1000],
  ['07', 'document', 1000], ['08', 'site', 1000], ['09', 'etape', 1080],
  ['10', 'media', 1000], ['11', 'interaction', 1000], ['12', 'tache', 1000],
  ['13', 'classement', 640], ['14', 'adhesion', 640], ['15', 'plat', 640],
  ['16', 'menu', 1040], ['17', 'prestataire', 640], ['18', 'fiche-liee', 640],
];
const VIEWPORTS = [
  ['desktop', 1440, 1100], ['short', 1280, 720], ['mobile', 390, 844],
];
const BODY_HEIGHTS = { '01': 700, '02': 760, '03': 700, '04': 760, '05': 640, '06': 700,
  '07': 740, '08': 720, '09': 740, '10': 740, '11': 740, '12': 620, '16': 760 };
const ASIDE_WIDTHS = { '01': 300, '02': 300, '03': 300, '04': 300, '05': 300, '06': 300,
  '07': 300, '08': 380, '09': 460, '10': 320, '11': 300, '12': 300 };

async function state(page) {
  return page.getByRole('dialog').evaluate(dialog => {
    const box = el => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return Object.fromEntries(['x', 'y', 'width', 'height', 'top', 'bottom', 'left', 'right'].map(key => [key, Math.round(r[key] * 100) / 100]));
    };
    const header = dialog.querySelector('.ed-record-modal__header, .plm__head');
    const footer = dialog.querySelector('.ed-record-modal__footer, .plm__foot');
    const layout = dialog.querySelector('.ed-record-modal__layout, .plm__body');
    const form = dialog.querySelector('.ed-menu-list') ?? dialog.querySelector('.plm__form') ?? dialog.querySelector('.ed-modal__body');
    const aside = dialog.querySelector('.ed-menu-panel, .plm__aside, .ed-record-modal__aside');
    const info = el => el ? {
      box: box(el), scrollTop: el.scrollTop, clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight, clientWidth: el.clientWidth, scrollWidth: el.scrollWidth,
      overflowY: getComputedStyle(el).overflowY,
    } : null;
    return {
      dialog: info(dialog), header: box(header), footer: box(footer), layout: info(layout),
      form: info(form), aside: info(aside), pageWidth: document.documentElement.scrollWidth,
      documentTop: document.documentElement.scrollTop, windowY: window.scrollY,
    };
  });
}

function unchanged(before, after, label) {
  for (const key of ['dialog', 'header', 'footer']) {
    const a = key === 'dialog' ? before[key].box : before[key];
    const b = key === 'dialog' ? after[key].box : after[key];
    assert(a && b, `${label}: ${key} missing`);
    for (const field of ['x', 'y', 'width', 'height']) {
      assert(Math.abs(a[field] - b[field]) <= 0.6, `${label}: ${key}.${field} moved ${a[field]} -> ${b[field]}`);
    }
  }
  assert.equal(after.dialog.scrollTop, before.dialog.scrollTop, `${label}: whole dialog scrolled`);
  assert.equal(after.documentTop, before.documentTop, `${label}: document scrolled`);
  assert.equal(after.windowY, before.windowY, `${label}: window scrolled`);
}

async function wheel(page, selector, delta = 420) {
  const point = await page.locator(selector).first().evaluate(el => {
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + Math.min(r.height / 2, 200) };
  });
  await page.mouse.move(point.x, point.y);
  await page.mouse.wheel(0, delta);
  await page.waitForTimeout(160);
}

async function desktopScroll(page, split) {
  const left = split === 'pricing' ? '.plm__form' : split === 'menu' ? '.ed-menu-list' : '.ed-modal__body';
  const right = split === 'pricing' ? '.plm__aside' : split === 'menu' ? '.ed-menu-panel' : '.ed-record-modal__aside';
  const selectors = split === 'single' ? [left] : [left, right];
  await page.evaluate(selectors => {
    for (const selector of selectors) {
      const el = document.querySelector('[role="dialog"] ' + selector);
      const fixture = document.createElement('div');
      fixture.setAttribute('data-scroll-stress-fixture', 'true');
      fixture.style.cssText = 'height:2000px;min-height:2000px;flex:none;grid-column:1/-1;pointer-events:none;';
      el.prepend(fixture);
      el.scrollTop = 0;
    }
  }, selectors);
  await page.waitForTimeout(40);
  const initial = await state(page);
  for (const [i, selector] of selectors.entries()) {
    await page.evaluate(selectors => {
      for (const selector of selectors) document.querySelector('[role="dialog"] ' + selector).scrollTop = 0;
    }, selectors);
    const before = await state(page);
    await wheel(page, selector);
    const after = await state(page);
    const target = i === 0 ? 'form' : 'aside';
    const other = i === 0 ? 'aside' : 'form';
    assert(after[target].scrollTop > before[target].scrollTop + 20, `${target}: wheel did not scroll its own column`);
    if (split !== 'single') {
      assert.equal(after[other].scrollTop, before[other].scrollTop, `${target}: other column scrolled`);
      for (const field of ['x', 'y', 'width', 'height']) assert.equal(after[other].box[field], before[other].box[field], `${target}: other column moved`);
    }
    assert.equal(after.layout.scrollTop, before.layout.scrollTop, `${target}: shared layout scrolled`);
    unchanged(before, after, target);
  }
  return { mode: split, columns_tested: selectors.length, fixture_height: 2000, initial };
}

async function mobileScroll(page) {
  const target = await page.getByRole('dialog').evaluate(dialog => {
    const content = dialog.querySelector('.ed-menu-list') ?? dialog.querySelector('.plm__form') ?? dialog.querySelector('.ed-modal__body');
    const fixture = document.createElement('div');
    fixture.style.cssText = 'height:2000px;min-height:2000px;flex:none;grid-column:1/-1;pointer-events:none;';
    fixture.setAttribute('data-scroll-stress-fixture', 'true');
    content.prepend(fixture);
    let scroller = content;
    while (scroller && scroller !== dialog && !['auto', 'scroll'].includes(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
    if (scroller === dialog) scroller = null;
    if (!scroller) throw Error('Mobile inner scroller missing');
    scroller.setAttribute('data-scroll-mobile-target', 'true');
    scroller.scrollTop = 0;
    return scroller.className;
  });
  await page.waitForTimeout(40);
  const before = await state(page);
  await wheel(page, '[data-scroll-mobile-target]');
  const after = await state(page);
  const scrolled = await page.locator('[data-scroll-mobile-target]').evaluate(el => el.scrollTop);
  assert(scrolled > 20, 'Mobile body did not scroll');
  unchanged(before, after, 'mobile');
  return { mode: 'mobile-one-inner-scroller', target, scrollTop: scrolled };
}

async function roomDetails(page) {
  const capacity = page.getByRole('spinbutton', { name: 'Couchages (total)', exact: true });
  await capacity.fill('4');
  await page.getByText('Personnes', { exact: true }).click();
  assert.equal(await capacity.inputValue(), '4', 'Clicking the capacity label changed its value');
  assert.equal(await capacity.evaluate(input => input === document.activeElement), true, 'Capacity label did not focus its input');
  const folded = await page.getByRole('dialog').evaluate(dialog => [...dialog.querySelectorAll('button[aria-controls][aria-expanded="false"]')]
    .filter(button => /-(types|split|beds|equipment|view|size|description|photos)$/.test(button.getAttribute('aria-controls')))
    .map(button => ({ label: button.textContent.trim(), panel: document.getElementById(button.getAttribute('aria-controls')) }))
    .filter(row => row.panel && dialog.contains(row.panel)).map(row => ({ label: row.label,
      hidden: getComputedStyle(row.panel).display === 'none' && row.panel.getClientRects().length === 0 })));
  assert(folded.length >= 8, 'Room progressive controls missing');
  assert(folded.every(row => row.hidden), 'Collapsed room details are rendered visibly: ' + folded.filter(row => !row.hidden).map(row => row.label).join(', '));
  const checked = [];
  for (const suffix of ['types', 'split', 'beds', 'equipment', 'view', 'size', 'description', 'photos']) {
    const control = page.locator(`.ed-room-modal button[aria-controls$="-${suffix}"]`).first();
    assert.equal(await control.getAttribute('aria-expanded'), 'false', `${suffix}: expected collapsed initial state`);
    await control.click();
    assert.equal(await control.getAttribute('aria-expanded'), 'true', `${suffix}: did not expand`);
    assert.equal(await control.evaluate(button => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      return panel && getComputedStyle(panel).display !== 'none' && panel.getClientRects().length > 0;
    }), true, `${suffix}: open content remains hidden`);
    if (suffix === 'split') {
      await page.getByRole('spinbutton', { name: 'Couchages (total)', exact: true }).fill('4');
      await page.getByRole('spinbutton', { name: 'Enfants', exact: true }).fill('1');
    }
    if (suffix === 'beds') {
      await page.getByRole('button', { name: 'Ajouter un lit', exact: true }).click();
      await page.getByRole('spinbutton', { name: 'Nombre de lits 1', exact: true }).fill('2');
    }
    if (suffix === 'equipment') assert(await page.getByRole('textbox', { name: 'Rechercher un équipement', exact: true }).isVisible());
    if (suffix === 'size') await page.getByRole('spinbutton', { name: 'Surface', exact: true }).fill('24');
    if (suffix === 'description') {
      const editor = page.locator('[contenteditable="true"][aria-label="Description de la chambre"]');
      await editor.waitFor({ state: 'visible', timeout: 15000 });
      await editor.fill('Description QA conservée');
    }
    await control.click();
    assert.equal(await control.getAttribute('aria-expanded'), 'false', `${suffix}: did not collapse`);
    assert.equal(await control.evaluate(button => {
      const panel = document.getElementById(button.getAttribute('aria-controls'));
      return panel && getComputedStyle(panel).display === 'none' && panel.getClientRects().length === 0;
    }), true, `${suffix}: content remains visible after collapse`);
    await control.click();
    if (suffix === 'split') assert.equal(await page.getByRole('spinbutton', { name: 'Enfants', exact: true }).inputValue(), '1', 'Children value lost on folding');
    if (suffix === 'beds') assert.equal(await page.getByRole('spinbutton', { name: 'Nombre de lits 1', exact: true }).inputValue(), '2', 'Bed quantity lost on folding');
    if (suffix === 'size') assert.equal(await page.getByRole('spinbutton', { name: 'Surface', exact: true }).inputValue(), '24', 'Surface lost on folding');
    if (suffix === 'description') assert((await page.locator('[contenteditable="true"][aria-label="Description de la chambre"]').innerText()).includes('Description QA conservée'), 'Description lost on folding');
    await control.click();
    checked.push(suffix);
  }
  return { initially_hidden: folded, toggled_twice: checked, retained: ['children', 'bed_quantity', 'surface', 'description'], saved_to_live: false };
}

(async () => {
  const selected = process.env.MODAL_NUMBERS?.split(',').map(value => value.trim());
  if (selected && selected.some(number => !STORIES.some(row => row[0] === number))) throw new Error('MODAL_NUMBERS must contain reference numbers 01 to 18');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROME_EXECUTABLE ? { executablePath: path.resolve(process.env.CHROME_EXECUTABLE) } : {}) });
  const results = [];
  try {
    for (const [number, story, expectedWidth] of STORIES.filter(([number]) => !selected || selected.includes(number))) {
      const group = ['13', '14', '15', '16', '17'].includes(number) ? 'catalogues' : 'horaires-et-tarifs';
      for (const [viewport, width, height] of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        const result = { number, story, viewport, width, height };
        try {
          await page.route('**/*', route => {
            const url = route.request().url();
            if (url.startsWith(ORIGIN + '/') || /^(data:|blob:)/.test(url)) return route.continue();
            if (/styles|liberty|bright|positron/i.test(url)) return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#e5eeeb' } }] }) });
            return route.abort();
          });
          await page.goto(`${ORIGIN}/iframe.html?id=editor-modal-models-${group}--${story}&viewMode=story`, { timeout: 45000 });
          await page.getByRole('dialog').waitFor({ timeout: 45000 });
          await page.waitForTimeout(400);
          result.natural = await state(page);
          const b = result.natural.dialog.box;
          assert(b.x >= -0.6 && b.y >= -0.6 && b.right <= width + 0.6 && b.bottom <= height + 0.6, 'Dialog outside viewport');
          assert(result.natural.dialog.scrollWidth <= result.natural.dialog.clientWidth + 1, 'Dialog horizontal overflow');
          assert(result.natural.pageWidth <= width + 1, 'Page horizontal overflow');
          assert(result.natural.footer.bottom <= b.bottom + 0.6 && result.natural.footer.top >= b.top, 'Footer clipped');
          if (viewport !== 'mobile') assert(Math.abs(b.width - expectedWidth) <= 1, `Width ${b.width} differs from reference ${expectedWidth}`);
          if (viewport === 'desktop' && BODY_HEIGHTS[number]) {
            assert(Math.abs(result.natural.layout.box.height - BODY_HEIGHTS[number]) <= 1,
              `Body height ${result.natural.layout.box.height} differs from reference ${BODY_HEIGHTS[number]}`);
          }
          if (viewport !== 'mobile' && ASIDE_WIDTHS[number]) {
            assert(Math.abs(result.natural.aside.box.width - ASIDE_WIDTHS[number]) <= 1,
              `Aside width ${result.natural.aside.box.width} differs from reference ${ASIDE_WIDTHS[number]}`);
          }
          if (viewport !== 'mobile' && number === '16') assert(Math.abs(result.natural.form.box.width - 360) <= 1, 'Menu left column differs from reference 360px');
          if (viewport !== 'short' || ['01', '04', '08', '09', '16'].includes(number)) {
            const shot = `${number}-${viewport}.png`;
            await page.screenshot({ path: path.join(OUTPUT_DIR, shot), fullPage: false });
            result.screenshot = shot;
          }
          if (number === '04') result.room_progressive_details = await roomDetails(page);
          const split = number === '01' ? 'pricing' : number === '16' ? 'menu' : result.natural.aside ? 'preview' : 'single';
          result.scroll = viewport === 'mobile' ? await mobileScroll(page) : await desktopScroll(page, split);
          assert.equal(errors.length, 0, 'Browser JavaScript errors');
          result.status = 'passed';
        } catch (error) {
          result.status = 'failed';
          result.error = String(error.message ?? error);
          result.after_failure = await state(page).catch(() => null);
          await page.screenshot({ path: path.join(OUTPUT_DIR, `${number}-${viewport}-failure.png`), fullPage: false }).catch(() => {});
        } finally {
          result.errors = errors;
          results.push(result);
          console.log(JSON.stringify({ number, viewport, status: result.status, error: result.error }));
          await page.close();
        }
      }
    }
  } finally { await browser.close(); }
  const report = { observed_at: new Date().toISOString(), source: ORIGIN, actual_mouse_wheel: true,
    limitations: ['Storybook fixtures only; no production deployment or authenticated API test',
      'Geometry, scrolling and room folding are verified; no pixel-identity claim for every design detail',
      'External media/map network requests are blocked or given an empty test basemap'],
    stress_content: '2000px fixture prepended in browser DOM only; no application or live-data writes',
    total: results.length, passed: results.filter(r => r.status === 'passed').length,
    failed: results.filter(r => r.status === 'failed').length, results };
  const file = selected ? 'scroll-verification-selected.json' : 'scroll-verification.json';
  fs.writeFileSync(path.join(OUTPUT_DIR, file), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ file, total: report.total, passed: report.passed, failed: report.failed }));
  if (report.failed) process.exitCode = 1;
})().catch(error => { console.error(error.message); process.exitCode = 1; });
