import type { BackendObjectTypeCode, ExplorerTaxonomyDomain, ExplorerTaxonomyNode } from '../../types/domain';

/**
 * §201 — construction de l'arbre d'hébergement rendu par le panneau de filtres.
 *
 * INVARIANT CENTRAL, et la raison d'être de ce fichier :
 *
 *   Une entrée visuellement subordonnée à une autre DOIT être reliée par
 *   `parentCode` dans le MÊME domaine. `metadata.famille` ne produit qu'un
 *   regroupement PLAT et ne crée JAMAIS de parenté.
 *
 * Ce n'est pas une préférence de style. Côté serveur, filtrer un nœud parent ne
 * remonte les porteurs de ses enfants que parce que `cached_taxonomy_codes` est
 * bâti depuis la closure `parent_id`. Imbriquer à l'écran deux nœuds qui ne sont
 * pas parent/enfant en base produirait donc un filtre qui ment : l'utilisateur
 * choisit « Terrain de camping déclaré » et ne voit aucun camping à la ferme.
 *
 * D'où les règles ci-dessous — et le fait qu'un sous-type orphelin soit EXCLU du
 * rendu imbriqué plutôt que rétrogradé au rang de nature sœur : le présenter
 * comme une nature serait exactement le mensonge que §201 supprime.
 */

export interface AccommodationTaxonomyEntry {
  domain: string;
  objectType: BackendObjectTypeCode;
  node: ExplorerTaxonomyNode;
}

/** Une nature et ses vrais sous-types (same-domain, reliés par `parentCode`). */
export interface AccommodationTreeNode {
  entry: AccommodationTaxonomyEntry;
  children: AccommodationTreeNode[];
}

export interface AccommodationFamilyGroup {
  /** Code de `accommodation_family` (`collectif`, `campings_terrains`, …). */
  code: string;
  natures: AccommodationTreeNode[];
}

export interface AccommodationTaxonomyTree {
  families: AccommodationFamilyGroup[];
  /** Axe « Type d'unité » — rendu dans les Critères complémentaires. */
  unitTypes: AccommodationTaxonomyEntry[];
  /** Axe « Positionnement » — idem. */
  positionings: AccommodationTaxonomyEntry[];
  /**
   * Sous-types dont le parent n'est pas une nature retenue du même domaine.
   * Exclus du rendu ; exposés ici pour que l'appelant puisse les signaler.
   */
  orphanSubtypes: AccommodationTaxonomyEntry[];
}

const entryKey = (entry: AccommodationTaxonomyEntry) => `${entry.domain}:${entry.node.code}`;

function compareEntries(left: AccommodationTaxonomyEntry, right: AccommodationTaxonomyEntry): number {
  return (
    (left.node.position ?? Number.MAX_SAFE_INTEGER) - (right.node.position ?? Number.MAX_SAFE_INTEGER)
    || left.node.name.localeCompare(right.node.name, 'fr', { sensitivity: 'base' })
  );
}

/**
 * Projette les domaines techniques d'hébergement en familles plates de natures,
 * chaque nature portant ses vrais sous-types.
 *
 * @param domains domaines déjà restreints aux types d'hébergement.
 * @param familyOrder codes de famille dans l'ordre du catalogue ; les familles
 *   absentes de cette liste sont rendues après, par ordre alphabétique de code.
 */
export function buildAccommodationTaxonomyTree(
  domains: ExplorerTaxonomyDomain[],
  familyOrder: string[] = [],
): AccommodationTaxonomyTree {
  // 1. Un nœud non assignable ne doit apparaître NULLE PART — ni en famille, ni
  //    en sous-arbre, ni en critère complémentaire. C'est ce filtrage, posé
  //    AVANT toute construction, qui rend ce composant compatible à la fois avec
  //    l'ancien et le nouveau catalogue : le jour où le SQL rend
  //    `outdoor_glamping` non assignable, il disparaît sans redéploiement.
  const entries: AccommodationTaxonomyEntry[] = domains.flatMap((domain) =>
    domain.nodes
      .filter((node) => Boolean(node.axis) && node.isAssignable !== false)
      .map((node) => ({
        domain: domain.domain,
        objectType: domain.objectType as BackendObjectTypeCode,
        node,
      })),
  );

  const natures = entries.filter((entry) => entry.node.axis === 'nature').sort(compareEntries);
  const subtypes = entries.filter((entry) => entry.node.axis === 'sous_type').sort(compareEntries);

  // 2. L'index est clé COMPOSÉE domaine+code. Deux domaines peuvent porter le
  //    même code sans avoir le moindre rapport : les confondre fusionnerait des
  //    nœuds distincts (et ferait pointer un filtre sur le mauvais domaine).
  const natureByKey = new Map(natures.map((entry) => [entryKey(entry), entry]));
  // Les nœuds d'axe `famille` sont des CONTENEURS de premier niveau présents dans
  // l'arbre technique (ex. `taxonomy_hlo.hebergement_collectif`), pas des natures.
  const containerKeys = new Set(
    entries.filter((entry) => entry.node.axis === 'famille').map(entryKey),
  );

  const childrenByParentKey = new Map<string, AccommodationTaxonomyEntry[]>();
  const promotedSubtypes: AccommodationTaxonomyEntry[] = [];
  const orphanSubtypes: AccommodationTaxonomyEntry[] = [];

  for (const entry of subtypes) {
    // 3. La résolution du parent est STRICTEMENT intra-domaine : un `parentCode`
    //    identique dans un autre domaine n'établit aucune parenté.
    const parentKey = entry.node.parentCode ? `${entry.domain}:${entry.node.parentCode}` : null;
    if (parentKey && natureByKey.has(parentKey)) {
      // Parent = une NATURE : vraie subordination, rendue imbriquée.
      const bucket = childrenByParentKey.get(parentKey) ?? [];
      bucket.push(entry);
      childrenByParentKey.set(parentKey, bucket);
    } else if (parentKey && containerKeys.has(parentKey)) {
      // Parent = le CONTENEUR de famille : le nœud est déjà au premier niveau de
      // sa famille, il n'est subordonné à aucune nature. C'est l'état du
      // catalogue AVANT la migration §201 (les 3 natures collectives HLO y sont
      // encore marquées `sous_type` sous `hebergement_collectif`). Les rétrograder
      // en orphelins les ferait disparaître de l'Explorer pendant la fenêtre où
      // le frontend est déployé avant le SQL — exactement ce que l'ordre de
      // déploiement cherche à éviter.
      promotedSubtypes.push(entry);
    } else {
      // Ni nature ni conteneur : erreur de catalogue (axe posé, re-parentage
      // oublié). Exclu du rendu — le montrer comme une nature sœur recréerait la
      // fausse hiérarchie que §201 supprime.
      orphanSubtypes.push(entry);
    }
  }

  if (orphanSubtypes.length > 0 && process.env.NODE_ENV !== 'production') {
    // Signal de développement, jamais un rendu dégradé : un sous-type sans
    // parent réel est une erreur de catalogue (axe posé sans re-parentage), et
    // l'afficher comme une nature sœur recréerait la fausse hiérarchie de §192.
    console.warn(
      '[accommodation-taxonomy] sous-type(s) sans parent same-domain, exclus du rendu :',
      orphanSubtypes.map(entryKey).join(', '),
    );
  }

  // 4. Les familles sont des groupes PLATS. `family` ne descend jamais d'un
  //    cran : elle choisit seulement le bloc de premier niveau.
  const naturesByFamily = new Map<string, AccommodationTreeNode[]>();
  for (const entry of [...natures, ...promotedSubtypes].sort(compareEntries)) {
    const family = entry.node.family;
    if (!family) continue;
    const bucket = naturesByFamily.get(family) ?? [];
    bucket.push({
      entry,
      children: (childrenByParentKey.get(entryKey(entry)) ?? []).map((child) => ({ entry: child, children: [] })),
    });
    naturesByFamily.set(family, bucket);
  }

  const orderIndex = new Map(familyOrder.map((code, index) => [code, index]));
  const families: AccommodationFamilyGroup[] = Array.from(naturesByFamily.entries())
    .map(([code, natureNodes]) => ({ code, natures: natureNodes }))
    .sort((left, right) => {
      const a = orderIndex.get(left.code) ?? Number.MAX_SAFE_INTEGER;
      const b = orderIndex.get(right.code) ?? Number.MAX_SAFE_INTEGER;
      return a - b || left.code.localeCompare(right.code, 'fr');
    });

  return {
    families,
    unitTypes: entries.filter((entry) => entry.node.axis === 'type_unite').sort(compareEntries),
    positionings: entries.filter((entry) => entry.node.axis === 'positionnement').sort(compareEntries),
    orphanSubtypes,
  };
}

/**
 * Applique la recherche à un groupe de natures sans casser les chemins.
 *
 * Une correspondance sur un ENFANT conserve son parent (sinon le résultat serait
 * inatteignable, l'enfant n'existant à l'écran que dans le conteneur du parent).
 * Une correspondance sur le PARENT conserve tous ses enfants.
 */
export function filterAccommodationNatures(
  natures: AccommodationTreeNode[],
  matches: (node: ExplorerTaxonomyNode) => boolean,
): AccommodationTreeNode[] {
  const result: AccommodationTreeNode[] = [];
  for (const nature of natures) {
    const natureMatches = matches(nature.entry.node);
    const matchingChildren = nature.children.filter((child) => matches(child.entry.node));
    if (natureMatches) {
      result.push(nature);
    } else if (matchingChildren.length > 0) {
      result.push({ entry: nature.entry, children: matchingChildren });
    }
  }
  return result;
}

/** Le chemin affiché dans les résumés et les filtres actifs : « Famille › Nature ». */
export function accommodationBreadcrumb(familyLabel: string, ...names: string[]): string {
  return [familyLabel, ...names].filter(Boolean).join(' › ');
}
