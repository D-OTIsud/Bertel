'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const md = require('./partenaires-render.js');
const guide = require('./thesaurus-render.js');
const read = (name) => fs.readFileSync(path.join(__dirname, name), 'utf8');
const canonical = read('guide-metier-thesaurus.md');
const partner = read('guide-partenaires.md');
// Git may check out CRLF on Windows; only line endings are platform-specific.
const page = read('thesaurus.html').replace(/\r\n/g, '\n');
assert.equal(page, guide.buildFromFiles(), 'regenerate the public guide after a source or template change');

const body = page.match(/<main class="doc" id="doc">\n([\s\S]*?)\n    <\/main>/)?.[1];
assert.ok(body, 'the complete guide must be present before JavaScript runs');
const plain = (html) => html.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
const publicText = plain(body).replaceAll(' (référence interne au dépôt)', '');
const expectedText = plain(md.render(canonical).html);
assert.equal(publicText, expectedText, 'preserve every instruction, table, list and reference label in order');
assert.equal((body.match(/<h2\b/g) || []).length, 15, 'all fourteen numbered chapters and the quick path');
assert.equal((body.match(/<table\b/g) || []).length, 10, 'all comparison, domain-context and preparation tables remain readable');
assert.ok(body.includes('<th>Rubrique</th><th>La choisir pour…</th><th>À distinguer de…</th>'), 'include the business-domain distinctions table');
for (const label of ['Labels et classements', 'Valeurs des labels et classements', 'Types de forfait', 'Catégories de menu', 'Publics tarifaires', 'Types de tarif', 'Unités tarifaires']) {
  assert.ok(body.includes(label), 'the domain-context table includes ' + label);
}

const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((entry) => entry[1]);
assert.equal(new Set(ids).size, ids.length, 'page anchors must be unique');
let localLinks = 0;
for (const entry of page.matchAll(/<a href="([^"]+)"/g)) {
  const href = entry[1];
  if (/^(https?:|mailto:)/i.test(href)) continue;
  const [file, fragment] = href.split('#');
  const target = file ? read(file) : page;
  if (fragment) {
    if (file === 'partenaires.html') {
      assert.ok(md.render(partner).html.includes('id="' + fragment + '"'), 'the partner link must target its rendered section');
    } else assert.ok(target.includes('id="' + fragment + '"'), 'unresolved local anchor: ' + href);
  }
  assert.ok(['', 'index.html', 'partenaires.html'].includes(file), 'only intentionally published pages may be linked: ' + href);
  localLinks++;
}
assert.ok(localLinks >= 45, 'quick paths, table of contents and cross-guide navigation are linked');
assert.ok(read('index.html').includes('href="thesaurus.html">Guide métier du thésaurus</a>'), 'discoverable from the team space');
assert.ok(read('partenaires.html').includes('href="thesaurus.html"'), 'cross-guide navigation');
assert.ok(!/fetch\(|\.innerHTML\s*=|eval\(|document\.write\(/.test(page), 'reading the static guide must not execute a dynamic HTML loader');

const hostile = '<script>alert("unsafe")</script>\n\n[Bad](javascript:alert(1))\n\n[Good](https://example.test/)';
const escaped = md.render(hostile).html;
assert.ok(!escaped.includes('<script>'), 'source HTML is escaped');
assert.ok(escaped.includes('&lt;script&gt;'), 'escaped source remains visible as text');
assert.ok(!escaped.includes('href="javascript:'), 'executable link schemes are blocked');
assert.ok(escaped.includes('rel="noopener noreferrer"'), 'external links retain the existing safe treatment');
assert.throws(() => guide.publicBody(canonical.replace('#5-ajouter-et-relire-les-traductions', '#nonexistent-section'), partner), /Unresolved guide anchor/, 'broken public anchors must fail the build');

const dockerfile = read('Dockerfile');
assert.match(dockerfile, /^COPY .*\bthesaurus\.html\b.*\/usr\/share\/nginx\/html\//m, 'copy the rendered page deliberately');
for (const line of dockerfile.split('\n').filter((line) => /^COPY\s/.test(line))) {
  assert.ok(!/guide-metier-thesaurus|thesaurus-render|conformite-rgpd|audits\/|\.tsx?\b|migrations\/|\*/.test(line), 'do not serve canonical sources, build tools or private supporting documents: ' + line);
}
assert.match(read('nginx.conf'), /location = \/partenaires-render\.js\s*\{[^}]*no-cache/s, 'the existing public renderer is not immutable-cached');
assert.ok(!/<script\s+src=/.test(page), 'the generated guide adds no cache-sensitive public JavaScript');
console.log('OK — complete static guide, ' + ids.length + ' unique anchors, ' + localLinks + ' valid local links; canonical and private sources are not deployed.');
