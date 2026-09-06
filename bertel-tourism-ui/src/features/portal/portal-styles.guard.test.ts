/**
 * Garde-fou CSS du portail partenaire.
 *
 * Deux invariants du bloc `.portal-*` ne sont visibles NULLE PART dans un test de rendu :
 * jsdom n'applique pas les feuilles de style, et aucune assertion RTL ne peut voir qu'un
 * titre est masqué ou qu'une cible est passée sous 48 px. Ils sont donc épinglés ici, sur
 * le texte de la règle — c'est peu, mais c'est ce qui empêche une régression muette entre
 * deux recettes manuelles.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const css = readFileSync(join(__dirname, '..', '..', 'styles.css'), 'utf8');

/**
 * Le corps d'une règle, retrouvé par son sélecteur EXACT en début de ligne — pas par une
 * simple recherche de sous-chaîne : `.portal-choice` apparaît d'abord dans une règle de
 * focus, dont le corps ne dit rien des cibles tactiles.
 */
function ruleBody(selector: string): string {
  const index = css.indexOf(`\n${selector} {`);
  if (index === -1) throw new Error(`Règle « ${selector} » introuvable dans styles.css`);
  const open = css.indexOf('{', index);
  const close = css.indexOf('}', open);
  return css.slice(open + 1, close);
}

describe('portail — le titre de la fiche reste dans le document', () => {
  test('la vue rubrique masque l’en-tête SAUF son h1', () => {
    // Le titre de rubrique est un `h2` : masquer l'en-tête EN ENTIER laisserait la page
    // sans aucun `h1` sous 1024 px, et l'afficher en donnerait DEUX à partir de 1024 px.
    // La forme juste est un `h1` unique dont le contenu change — d'où l'exception.
    expect(css).toContain(".portal-fiche-page[data-view='rubric'] .portal-fiche-head > *:not(.portal-h1)");
    // …et le h1 conservé est rendu invisible à l'œil, pas retiré de l'arbre.
    const kept = css.slice(css.indexOf(".portal-fiche-page[data-view='rubric'] .portal-fiche-head > .portal-h1"));
    expect(kept.slice(0, kept.indexOf('}'))).toContain('clip-path');
  });
});

describe('portail — les cibles tactiles ne repassent pas sous 48 px', () => {
  test.each([
    ['.portal-input--time', 'les champs heure de « Vos horaires »'],
    ['.portal-pill', 'les raccourcis de jours'],
    ['.portal-choice', 'les cases et boutons radio'],
  ])('%s tient sa hauteur (%s)', (selector) => {
    const match = /min-height:\s*(\d+)px/.exec(ruleBody(selector));
    expect(match).not.toBeNull();
    // 48 px est la cible du pouce que tout l'espace partenaire respecte ; `.portal-choice`
    // est plus généreuse encore parce que le libellé fait partie de la cible.
    expect(Number(match?.[1])).toBeGreaterThanOrEqual(48);
  });
});
