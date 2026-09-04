#!/usr/bin/env node
/* Extrait des definitions completes de fonctions d'un fichier SQL, par nom.
 *
 * Usage: node tools/sql/extract_functions.cjs <fichier.sql> <fn1> [fn2 ...] > out.sql
 *
 * Pourquoi : api_views_functions.sql fait 467 Ko et contient des
 * `DROP FUNCTION ... CASCADE` ; le rejouer entier sur la PRODUCTION ferait tomber
 * les objets dependants. On n'en re-emet donc que les fonctions reellement
 * modifiees. Le bloc va de `CREATE OR REPLACE FUNCTION api.<nom>(` jusqu'au
 * terminateur de corps ($$; ou $fn$; en debut de ligne), REVOKE/GRANT/COMMENT
 * qui suivent immediatement inclus.
 */
const fs = require('fs');

const file = process.argv[2];
const names = process.argv.slice(3);
if (!file || names.length === 0) {
  console.error('usage: extract_functions.cjs <fichier.sql> <fn> [fn ...]');
  process.exit(2);
}

const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
const out = [];

for (const name of names) {
  const startRx = new RegExp('^CREATE OR REPLACE FUNCTION api\\.' + name + '\\s*\\(');
  let found = 0;
  for (let i = 0; i < lines.length; i++) {
    if (!startRx.test(lines[i])) continue;
    found++;
    // Le delimiteur du corps : premiere ligne `AS $tag$` rencontree.
    let tag = null;
    let j = i;
    for (; j < lines.length; j++) {
      const m = lines[j].match(/AS\s+(\$[A-Za-z_]*\$)\s*$/);
      if (m) { tag = m[1]; break; }
    }
    if (!tag) { console.error('!! corps introuvable pour ' + name); process.exit(1); }
    // Fin du corps : le meme tag suivi de `;`, en debut de ligne.
    let end = -1;
    for (let k = j + 1; k < lines.length; k++) {
      if (lines[k].startsWith(tag + ';')) { end = k; break; }
    }
    if (end < 0) { console.error('!! fin de corps introuvable pour ' + name); process.exit(1); }
    // On avale les REVOKE / GRANT / COMMENT / ALTER FUNCTION qui suivent.
    let tail = end;
    for (let k = end + 1; k < lines.length; k++) {
      const l = lines[k].trim();
      if (l === '') { tail = k; continue; }
      if (/^(REVOKE|GRANT|COMMENT ON FUNCTION|ALTER FUNCTION)\b/i.test(l) || l.startsWith('--')) {
        // Une declaration peut tenir sur plusieurs lignes : on va jusqu'au `;`.
        let k2 = k;
        while (k2 < lines.length && !lines[k2].trimEnd().endsWith(';') && !lines[k2].trim().startsWith('--')) k2++;
        tail = k2; k = k2; continue;
      }
      break;
    }
    out.push(lines.slice(i, tail + 1).join('\n'));
  }
  if (found === 0) { console.error('!! fonction introuvable : ' + name); process.exit(1); }
  if (found > 1) console.error('   (note: ' + found + ' definitions de ' + name + ' extraites)');
}

process.stdout.write('BEGIN;\n\n' + out.join('\n\n') + '\n\nCOMMIT;\n');
