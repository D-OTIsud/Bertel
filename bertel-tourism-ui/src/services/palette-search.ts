import type { ObjectCard } from '../types/domain';
import { NAME_MATCH_MIN_CHARS, searchObjectsByName, type NameMatch } from './name-search';

/**
 * Seuil d'armement, aligné sur le service : UNE seule valeur, pas deux
 * (`CommandPalette` l'importe pour gater sa requête).
 */
export const PALETTE_SEARCH_MIN_CHARS = NAME_MATCH_MIN_CHARS;
const PALETTE_SEARCH_LIMIT = 8;

/**
 * D24 — recherche d'objets de la palette ⌘K.
 *
 * Passe par `searchObjectsByName` (RPC `api.search_objects_by_name`) et NON
 * plus par le RPC des marqueurs de carte. Ce que ça change :
 *
 * - la limite `ponytail:` précédente est **LEVÉE** : le RPC markers ne rendait
 *   que les fiches GÉOLOCALISÉES, donc une fiche sans coordonnées était tout
 *   simplement introuvable à la palette. La recherche par nom porte sur tout
 *   le corpus visible, coordonnées ou pas ;
 * - un seul aller-retour léger (~20 ms mesuré) remplace le socle marqueurs
 *   (~250 ms) et son appel PAR BUCKET.
 *
 * Le PÉRIMÈTRE est auto-gardé CÔTÉ SERVEUR (publié pour tous, + les brouillons
 * du périmètre étendu pour un éditeur) : aucune résolution de statut ici — en
 * remettre une recréerait une seconde source de vérité.
 */
export async function searchPaletteObjects(query: string): Promise<ObjectCard[]> {
  if (query.trim().length < PALETTE_SEARCH_MIN_CHARS) {
    return [];
  }
  const matches = await searchObjectsByName(query);
  return matches.slice(0, PALETTE_SEARCH_LIMIT).map(toObjectCard);
}

/**
 * La palette n'affiche que le nom, le type et la commune : les autres champs de
 * `ObjectCard` sont ABSENTS parce que la recherche par nom ne les rend pas —
 * `open_now: null` dit « inconnu », jamais « fermé » (§133).
 */
function toObjectCard(match: NameMatch): ObjectCard {
  return {
    id: match.id,
    type: match.type,
    name: match.name,
    image: match.imageUrl,
    open_now: null,
    location: { lat: null, lon: null, city: match.city },
  };
}
