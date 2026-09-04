/**
 * Visibilité des rubriques du portail partenaire (18a).
 *
 * ERGONOMIE SEULEMENT. Le serveur (`api.submit_actor_fiche`) revalide chaque enveloppe
 * contre le plancher et la matrice de l'office et refuse en 22023. On filtre AVANT de
 * bâtir les enveloppes pour ne jamais montrer au partenaire une rubrique que l'office
 * a fermée — pas pour garder quoi que ce soit.
 *
 * Les deux listes viennent de `getPortalSectionVisibility` :
 *  - `floorModules`  : le plancher — les rubriques réservées à l'office, jamais ouvertes
 *                      au partenaire (juridique, publication, suivi, provenance…).
 *  - `maskedModules` : ce que CET office a fermé en plus, pour ce type de fiche.
 *
 * Une matrice non chargée (deux listes vides) ne réserve rien : le refus reste côté
 * serveur, et un écran vide se lirait « vous n'avez rien à modifier », ce qui est faux.
 */
import type { WorkspaceModuleId } from '../../services/object-workspace';

export function isModuleSubmittable(
  module: WorkspaceModuleId,
  maskedModules: string[],
  floorModules: string[],
): boolean {
  return !maskedModules.includes(module) && !floorModules.includes(module);
}
