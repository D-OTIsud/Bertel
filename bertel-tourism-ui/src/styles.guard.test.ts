import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/* Invariant maison : les tokens --*-rgb sont des canaux SÉPARÉS PAR DES ESPACES
   (« 23 107 106 ») — à la fois dans le :root statique de styles.css et via
   rgbChannels() de lib/theme.ts injecté au runtime. La forme legacy
   rgba(var(--theme-x-rgb), α) se substitue donc en « rgba(23 107 106, 0.1) » :
   syntaxe hybride invalide, la déclaration tombe SILENCIEUSEMENT (fond
   transparent, bordure en repli currentColor). Seule consommation valide :
   rgb(var(--theme-x-rgb) / α). Réf. : .drawer-header__nature (commit e8f7bc4),
   vérifié navigateur 2026-08-26. */

const SRC_DIR = join(__dirname);
const FORBIDDEN = /rgba\(\s*var\(/;

/* Les commentaires peuvent citer le motif interdit (ex. la note au-dessus de
   .drawer-header__nature) : on les blanchit en préservant les sauts de ligne
   pour que les numéros de ligne rapportés restent exacts. */
function blankOutComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ' '));
}

function collectCssFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    if (statSync(fullPath).isDirectory()) return collectCssFiles(fullPath);
    return entry.endsWith('.css') ? [fullPath] : [];
  });
}

describe('styles guard — tokens --*-rgb en canaux espacés', () => {
  test('aucune feuille CSS ne consomme un token via rgba(var(…), α)', () => {
    const violations = collectCssFiles(SRC_DIR).flatMap((file) =>
      blankOutComments(readFileSync(file, 'utf8'))
        .split('\n')
        .flatMap((line, index) =>
          FORBIDDEN.test(line)
            ? [`${relative(SRC_DIR, file)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );

    expect(violations).toEqual([]);
  });
});
