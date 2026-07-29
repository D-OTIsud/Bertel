/**
 * §201 — parcours de création guidée d'un hébergement : Famille → Nature →
 * Sous-type, le type technique étant CALCULÉ et jamais choisi.
 *
 * POURQUOI : un agent ne doit pas avoir à savoir ce que signifient HOT, HLO,
 * RVA, CAMP et HPA avant de créer une fiche. Ces codes sont des partitions
 * techniques héritées, pas un vocabulaire métier. Ils restent la clé du modèle
 * (facettes, exports partenaires) mais cessent d'être une question posée.
 *
 * DEUX RÈGLES QUI TIENNENT TOUT :
 *
 * 1. Le mapping nature → type technique est DÉRIVÉ du catalogue
 *    (`ref_code_domain_registry.object_type`, porté par `ExplorerTaxonomyDomain
 *    .objectType`). Une liste dupliquée ici dériverait au premier domaine ajouté.
 * 2. Le périmètre « hébergement » est DÉRIVÉ de `TYPE_ARCHETYPES` (archétype
 *    `HEB`). Les treize autres types gardent exactement leur parcours actuel :
 *    ce fichier ne les connaît pas et ne peut donc pas les casser.
 */
import { TYPE_ARCHETYPES } from '../archetypes';
import {
  buildAccommodationTaxonomyTree,
  type AccommodationTreeNode,
} from '../../../components/explorer/accommodation-taxonomy-tree';
import type { ExplorerAccommodationFamily, ExplorerTaxonomyDomain } from '../../../types/domain';

/** Les types techniques d'hébergement, dérivés de l'archétype — jamais listés à la main. */
export const ACCOMMODATION_TYPE_CODES: string[] = Object.entries(TYPE_ARCHETYPES)
  .filter(([, meta]) => meta.archetype === 'HEB')
  .map(([code]) => code)
  .sort();

export function isAccommodationType(code: string): boolean {
  return ACCOMMODATION_TYPE_CODES.includes(code);
}

export interface CreateAccommodationNature {
  domain: string;
  code: string;
  name: string;
  description: string | null;
  /** Type technique calculé depuis le domaine du nœud. */
  objectType: string;
  children: CreateAccommodationNature[];
}

export interface CreateAccommodationFamily {
  code: string;
  name: string;
  description: string | null;
  natures: CreateAccommodationNature[];
}

function toNature(node: AccommodationTreeNode): CreateAccommodationNature {
  return {
    domain: node.entry.domain,
    code: node.entry.node.code,
    name: node.entry.node.name,
    description: node.entry.node.description ?? null,
    objectType: node.entry.objectType,
    children: node.children.map(toNature),
  };
}

/**
 * Familles proposables à la création, avec leurs natures et sous-types.
 *
 * Réutilise l'arbre de l'Explorateur : même exclusion des nœuds non assignables
 * (on ne propose jamais de créer une fiche sur une nature qui n'accepte plus
 * d'écriture) et même règle de parenté same-domain. Deux constructions séparées
 * dériveraient l'une de l'autre.
 */
export function buildCreateAccommodationFamilies(
  taxonomies: ExplorerTaxonomyDomain[],
  families: ExplorerAccommodationFamily[],
): CreateAccommodationFamily[] {
  const accommodationDomains = taxonomies.filter((domain) => isAccommodationType(String(domain.objectType)));
  const tree = buildAccommodationTaxonomyTree(accommodationDomains, families.map((family) => family.code));
  const familyByCode = new Map(families.map((family) => [family.code, family]));

  return tree.families
    .map((group) => {
      const reference = familyByCode.get(group.code);
      return {
        code: group.code,
        name: reference?.name ?? group.code.replace(/_/g, ' '),
        description: reference?.description ?? null,
        natures: group.natures.map(toNature),
      };
    })
    .filter((family) => family.natures.length > 0);
}

/** Retrouve une nature (ou un sous-type) par son couple domaine/code. */
export function findAccommodationNature(
  families: CreateAccommodationFamily[],
  selection: { domain: string; code: string } | null,
): { family: CreateAccommodationFamily; parent: CreateAccommodationNature | null; nature: CreateAccommodationNature } | null {
  if (!selection) return null;
  for (const family of families) {
    for (const nature of family.natures) {
      if (nature.domain === selection.domain && nature.code === selection.code) {
        return { family, parent: null, nature };
      }
      for (const child of nature.children) {
        if (child.domain === selection.domain && child.code === selection.code) {
          return { family, parent: nature, nature: child };
        }
      }
    }
  }
  return null;
}

/**
 * Le type technique de la sélection courante, ou `null` si la sélection est
 * incomplète ou incohérente.
 *
 * Fail-closed : si le domaine du nœud choisi pointe vers un type qui n'est pas
 * un hébergement, on ne devine pas — le parcours reste bloqué plutôt que de
 * créer une fiche du mauvais type.
 */
export function resolveAccommodationTechnicalType(
  families: CreateAccommodationFamily[],
  selection: { domain: string; code: string } | null,
): string | null {
  const found = findAccommodationNature(families, selection);
  if (!found) return null;
  return isAccommodationType(found.nature.objectType) ? found.nature.objectType : null;
}

/** « Campings et terrains › Terrain de camping déclaré › Camping à la ferme ». */
export function accommodationSelectionPath(
  families: CreateAccommodationFamily[],
  selection: { domain: string; code: string } | null,
): string {
  const found = findAccommodationNature(families, selection);
  if (!found) return '';
  return [found.family.name, found.parent?.name, found.nature.name].filter(Boolean).join(' › ');
}
