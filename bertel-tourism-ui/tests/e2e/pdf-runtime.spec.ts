import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import ts from 'typescript';

/** Two vector pages avoid external fonts and make blank/fake rasterization fail. */
function twoPagePdf(): Buffer {
  const stream = (color: string) => `${color} rg 0 0 200 100 re f\n`;
  const red = stream('1 0 0');
  const blue = stream('0 0 1');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 4 0 R >>',
    `<< /Length ${red.length} >>\nstream\n${red}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << >> /Contents 6 0 R >>',
    `<< /Length ${blue.length} >>\nstream\n${blue}endstream`,
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, 'ascii'));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, 'ascii');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.slice(1).map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, 'ascii');
}

test('the real browser PDF rasterizer uses the shipped worker and returns page pixels', async ({ page, request }) => {
  // An isolated test page runs the UNMODIFIED application function. Only TypeScript
  // annotations are erased; pdf.js is the real locked browser module. The worker
  // and CSP come from the running app (also exercised against the final Alpine image).
  const root = process.cwd();
  const source = await readFile(path.join(root, 'src/lib/pdf-rasterize.ts'), 'utf8');
  const rasterizer = ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022,
  } }).outputText;
  const pdfjs = await readFile(path.join(root, 'node_modules/pdfjs-dist/build/pdf.mjs'), 'utf8');
  const shippedWorker = await readFile(path.join(root, 'public/pdf.worker.min.mjs'), 'utf8');
  const lockedWorker = await readFile(path.join(root, 'node_modules/pdfjs-dist/build/pdf.worker.min.mjs'), 'utf8');
  expect(shippedWorker.replace(/\r\n/g, '\n')).toBe(lockedWorker.replace(/\r\n/g, '\n'));
  const health = await request.get('/api/health');
  expect(health.ok()).toBe(true);
  const origin = new URL(health.url()).origin;
  const csp = health.headers()['content-security-policy'];
  expect(csp).toContain("worker-src 'self' blob:");
  const errors: string[] = [];
  const outsideRequests: string[] = [];
  const unexpectedPaths: string[] = [];
  const workers: string[] = [];
  const workerResponses: number[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.text().includes('Setting up fake worker')) errors.push(message.text());
  });
  page.on('worker', (worker) => workers.push(worker.url()));
  page.on('response', (response) => {
    if (new URL(response.url()).pathname === '/pdf.worker.min.mjs') workerResponses.push(response.status());
  });
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) {
      outsideRequests.push(url.origin);
      await route.abort();
      return;
    }
    if (url.pathname === '/__pdf-proof/fixture') {
      await route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': csp }, body:
        '<!doctype html><html><head><meta charset="utf-8"><title>PDF runtime proof</title>'
        + '<script type="importmap">{"imports":{"pdfjs-dist":"/__pdf-proof/pdf.mjs"}}</script></head><body></body></html>' });
    } else if (url.pathname === '/__pdf-proof/rasterizer.mjs') {
      await route.fulfill({ contentType: 'text/javascript', body: rasterizer });
    } else if (url.pathname === '/__pdf-proof/pdf.mjs') {
      await route.fulfill({ contentType: 'text/javascript', body: pdfjs });
    } else if (url.pathname === '/pdf.worker.min.mjs' || url.pathname === '/favicon.ico') {
      await route.continue(); // In particular, never mock the shipped PDF worker.
    } else {
      unexpectedPaths.push(url.pathname);
      await route.abort(); // Includes /api/menu/extract and every other app route.
    }
  });
  await page.goto('/__pdf-proof/fixture');
  const proof = await page.evaluate(async ({ bytes }) => {
    const url = '/__pdf-proof/rasterizer.mjs';
    const { rasterizePdfToImages } = await import(url) as {
      rasterizePdfToImages: (file: File, limit?: number) => Promise<Array<{ mime: string; base64: string }>>;
    };
    const file = () => new File([Uint8Array.from(bytes)], 'synthetic-two-pages.pdf', { type: 'application/pdf' });
    const images = await rasterizePdfToImages(file());
    const pages = [];
    for (const image of images) {
      const data = Uint8Array.from(atob(image.base64), (value) => value.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([data], { type: image.mime }));
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Canvas 2D unavailable');
      context.drawImage(bitmap, 0, 0);
      pages.push({ mime: image.mime, length: image.base64.length, width: canvas.width, height: canvas.height,
        pixel: Array.from(context.getImageData(canvas.width / 2, canvas.height / 2, 1, 1).data) });
      bitmap.close();
    }
    return { pages, capped: (await rasterizePdfToImages(file(), 1)).length };
  }, { bytes: Array.from(twoPagePdf()) });
  expect(proof.pages).toHaveLength(2);
  expect(proof.capped).toBe(1);
  for (const page of proof.pages) {
    expect(page).toMatchObject({ mime: 'image/jpeg', width: 400, height: 200 });
    expect(page.length).toBeGreaterThan(500);
    expect(page.pixel[3]).toBe(255);
  }
  expect(proof.pages[0].pixel[0]).toBeGreaterThan(230);
  expect(proof.pages[0].pixel[1]).toBeLessThan(25);
  expect(proof.pages[0].pixel[2]).toBeLessThan(25);
  expect(proof.pages[1].pixel[0]).toBeLessThan(25);
  expect(proof.pages[1].pixel[2]).toBeGreaterThan(230);
  expect(workers).toContain(`${origin}/pdf.worker.min.mjs`);
  expect(workerResponses.length).toBeGreaterThan(0);
  expect(workerResponses.every((status) => status === 200)).toBe(true);
  expect(errors).toEqual([]);
  expect(outsideRequests).toEqual([]);
  expect(unexpectedPaths).toEqual([]);
  console.log(JSON.stringify({ pdfBrowserProof: proof, realWorkerResponses: workerResponses.length }));
});
