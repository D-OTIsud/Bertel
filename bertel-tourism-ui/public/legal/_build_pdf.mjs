// Génère rgpd.pdf et dpia.pdf à partir des fichiers HTML adjacents.
// Usage : depuis bertel-tourism-ui/, exécuter `node public/legal/_build_pdf.mjs`.
// Dépendance : playwright (déjà présent dans devDependencies / node_modules).

import { chromium } from 'playwright';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));

const targets = [
  { html: 'rgpd.html', pdf: 'rgpd.pdf', title: 'Règlement RGPD — Bertel' },
  { html: 'dpia.html', pdf: 'dpia.pdf', title: "DPIA — Analyse d'Impact Bertel" },
  { html: 'cgu.html', pdf: 'cgu.pdf', title: "Conditions d'utilisation — Bertel" },
];

const browser = await chromium.launch();
try {
  for (const t of targets) {
    const htmlPath = path.join(here, t.html);
    const pdfPath = path.join(here, t.pdf);
    const url = pathToFileURL(htmlPath).href;

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle' });
    // Attendre que les polices Google soient chargées avant le rendu PDF
    await page.evaluate(() => document.fonts && document.fonts.ready);

    await page.pdf({
      path: pdfPath,
      format: 'A4',
      printBackground: true,
      margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' },
      displayHeaderFooter: true,
      headerTemplate: `
        <div style="font-size:9px; color:#6b7c77; width:100%; padding:0 14mm; font-family:Manrope,sans-serif;">
          <span>${t.title}</span>
        </div>`,
      footerTemplate: `
        <div style="font-size:9px; color:#6b7c77; width:100%; padding:0 14mm; font-family:Manrope,sans-serif; display:flex; justify-content:space-between;">
          <span>SPL OTI du SUD · Bertel 3.0</span>
          <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
        </div>`,
    });

    await context.close();
    console.log(`✓ ${t.pdf}`);
  }
} finally {
  await browser.close();
}
