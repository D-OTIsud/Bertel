/**
 * Brouillon local du portail partenaire (18a) — **socle minimal posé par la Task 12**.
 *
 * La Task 14 y ajoutera la lecture/écriture d'un brouillon complet (empreinte serveur,
 * debounce, restauration au montage). Task 12 n'a besoin que de DEUX gestes, et ils sont
 * posés ici plutôt que dupliqués dans le shell et l'accueil : savoir si une fiche porte des
 * modifications encore sur l'appareil, et tout effacer à la déconnexion.
 *
 * La clé est PRÉFIXÉE PAR LE COMPTE (`portal-draft:<userId>:<objectId>`) : un téléphone ou un
 * ordinateur d'office est souvent partagé, et rejouer le brouillon d'un autre partenaire
 * enverrait ses données à l'office sous le nom du suivant.
 *
 * Tous les accès sont gardés : `localStorage` n'existe pas au rendu serveur, et il JETTE
 * (SecurityError) en navigation privée sur certains navigateurs. Une panne de stockage ne
 * doit pas faire tomber l'accueil — au pire, l'appareil ne signale rien.
 */

const DRAFT_PREFIX = 'portal-draft:';

/** Préfixe des clés du compte, frontière de segment comprise (`u1` ≠ `u10`). */
function accountPrefix(userId: string): string {
  return `${DRAFT_PREFIX}${userId}:`;
}

export function portalDraftKey(userId: string, objectId: string): string {
  return `${accountPrefix(userId)}${objectId}`;
}

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Vrai si cette fiche porte des modifications enregistrées sur CET appareil, pour CE compte. */
export function hasPortalDraft(userId: string | null, objectId: string): boolean {
  if (!userId) return false;
  const store = getStore();
  if (!store) return false;
  try {
    return store.getItem(portalDraftKey(userId, objectId)) !== null;
  } catch {
    return false;
  }
}

/**
 * Efface TOUS les brouillons du compte donné — et rien d'autre.
 *
 * Appelée seulement après une déconnexion RÉUSSIE : tant que le partenaire reste connecté,
 * son travail non envoyé lui appartient encore.
 */
export function clearAllPortalDrafts(userId: string | null): void {
  if (!userId) return;
  const store = getStore();
  if (!store) return;
  try {
    const prefix = accountPrefix(userId);
    // Collecte AVANT suppression : retirer une clé pendant l'itération décale les index.
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && key.startsWith(prefix)) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Stockage indisponible : il n'y a alors aucun brouillon à effacer.
  }
}
