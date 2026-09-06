// Rebuild the HTML/PDF notice from its reviewed Markdown source.
// Usage: node scripts/build-legal-notice.mjs [--pdf]
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { compiler } from 'markdown-to-jsx';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = path.join(root, 'public', 'legal', 'rgpd');
const markdown = await readFile(`${base}.md`, 'utf8');
const body = renderToStaticMarkup(compiler(markdown, { wrapper: 'article', forceWrapper: true }));
const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Protection des données personnelles — Bertel</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f4f6f5;color:#203b3e;font:16px/1.65 Arial,Helvetica,sans-serif}
main{max-width:920px;margin:40px auto;background:white;border-top:6px solid #286a68;padding:42px 52px}
h1{font-size:30px;line-height:1.2;color:#164c4b;margin:0 0 20px}h2{font-size:21px;line-height:1.3;color:#164c4b;margin:30px 0 12px}
h3{font-size:17px;line-height:1.35;margin:20px 0 10px}p,ul,ol{margin:10px 0}li{margin:6px 0}
hr{border:0;border-top:1px solid #d9e4e1;margin:28px 0}a{color:#155a65;text-underline-offset:3px;overflow-wrap:anywhere}
blockquote{margin:16px 0;padding:9px 16px;border-left:3px solid #81aaa5;background:#f0f6f4}
table{border-collapse:collapse;width:100%;font-size:14px;margin:18px 0}th,td{border:1px solid #cdded9;padding:9px 11px;vertical-align:top;text-align:left}th{background:#eaf2ef;color:#164c4b}
code{font-size:.9em;overflow-wrap:anywhere}strong{font-weight:700}h1,h2,h3{break-after:avoid}p,li{orphans:3;widows:3}tr{break-inside:avoid}
@media(max-width:640px){main{margin:0;padding:24px 18px}h1{font-size:26px}table{font-size:12px}th,td{padding:6px}}
@media print{body{background:white;font-size:10pt;line-height:1.45}main{max-width:none;margin:0;padding:0;border-top:3px solid #286a68}h1{font-size:24pt;padding-top:12pt}h2{font-size:14pt;margin-top:20pt}h3{font-size:11pt}table{font-size:9pt}th,td{padding:6pt 7pt}hr{margin:16pt 0}blockquote{padding:5pt 10pt}a{color:inherit}}
</style></head><body><main>${body}</main></body></html>
`;
await writeFile(`${base}.html`, html, 'utf8');
console.log('Notice HTML regenerated from rgpd.md.');
if (process.argv.includes('--pdf')) {
  process.env.PLAYWRIGHT_BROWSERS_PATH ??= path.join(root, '.playwright-browsers');
  const { chromium } = await import('@playwright/test');
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    // This source has no remote assets. Keep PDF production deterministic and offline.
    await page.route('**/*', route => route.abort());
    await page.setContent(html, { waitUntil: 'load' });
    await page.pdf({
      path: `${base}.pdf`, format: 'A4', printBackground: true,
      margin: { top: '18mm', right: '17mm', bottom: '20mm', left: '17mm' },
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="font:8px Arial;color:#526966;width:100%;margin:0 17mm;display:flex;justify-content:space-between"><span>Bertel · Protection des données personnelles</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    console.log('Notice PDF regenerated from the same HTML.');
  } finally { await browser.close(); }
}
