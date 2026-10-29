const DRAFT_PREFIX = 'portal-draft:';

const SENT_PREFIX = 'portal-sent:';

/** La saisie EN COURS d'une rubrique — celle qui n'a pas encore été validée. */
const FORM_PREFIX = 'portal-form:';

/** Préfixe des clés du compte, frontière de segment comprise (`u1` ≠ `u10`). */
function accountPrefix(prefix: string, userId: string): string {
  return `${prefix}${userId}:`;
}

export function portalDraftKey(userId: string, objectId: string): string {
  return `${accountPrefix(DRAFT_PREFIX, userId)}${objectId}`;
}

export function portalSentKey(userId: string, objectId: string): string {
  return `${accountPrefix(SENT_PREFIX, userId)}${objectId}`;
}

export function portalFormKey(userId: string, objectId: string): string {
  return `${accountPrefix(FORM_PREFIX, userId)}${objectId}`;
}

function getStore(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function readRaw(key: string): string | null {
  const store = getStore();
  if (!store) return null;
  try {
    return store.getItem(key);
  } catch {
    return null;
  }
}

/** Vrai si l'écriture a abouti. Un échec (quota plein, stockage refusé) DOIT remonter :
 *  la saisie redevient volatile, et le taire ramène le problème d'origine, invisible. */
export function writeRaw(key: string, value: string): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    store.setItem(key, value);
    return true;
  } catch {
    // Quota atteint ou stockage refusé. On ne casse surtout pas la saisie en cours —
    // mais l'appelant le dira au partenaire.
    return false;
  }
}

export function removeRaw(key: string): void {
  const store = getStore();
  if (!store) return;
  try {
    store.removeItem(key);
  } catch {
    /* rien à effacer si le stockage est indisponible */
  }
}

/** Vrai si cette fiche porte des modifications enregistrées sur CET appareil, pour CE compte. */
export function hasPortalDraft(userId: string | null, objectId: string): boolean {
  if (!userId) return false;
  return readRaw(portalDraftKey(userId, objectId)) !== null;
}

/**
 * Vrai si CE compte a, sur CET appareil, quelque chose que l'office n'a pas encore reçu :
 * un brouillon validé (`portal-draft:`) ou une saisie en cours (`portal-form:`), TOUTES
 * fiches confondues.
 *
 * Portée ACCOUNT-WIDE, comme `clearAllPortalDrafts` : la déconnexion purge tout le compte,
 * et une question posée sur la seule fiche ouverte laisserait détruire en silence le
 * travail commencé sur les autres. `hasPortalDraft`, lui, reste par fiche — il répond à
 * une autre question (« ce brouillon-ci existe-t-il ? »).
 *
 * `portal-sent:` est délibérément EXCLU : il décrit ce qui est DÉJÀ parti à l'office. Sa
 * perte ne coûte pas une saisie, et retenir quelqu'un pour lui serait crier au loup.
 */
export function hasUnsentPortalWork(userId: string | null): boolean {
  if (!userId) return false;
  const store = getStore();
  if (!store) return false;
  try {
    const prefixes = [accountPrefix(DRAFT_PREFIX, userId), accountPrefix(FORM_PREFIX, userId)];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) return true;
    }
    return false;
  } catch {
    // Stockage indisponible : il n'y a alors rien de gardé, donc rien à perdre.
    return false;
  }
}

/**
 * Efface TOUS les brouillons ET instantanés du compte donné — et rien d'autre.
 *
 * Appelée seulement après une déconnexion RÉUSSIE : tant que le partenaire reste connecté,
 * son travail non envoyé lui appartient encore.
 */
export function clearAllPortalDrafts(userId: string | null): void {
  if (!userId) return;
  const store = getStore();
  if (!store) return;
  try {
    const prefixes = [
      accountPrefix(DRAFT_PREFIX, userId),
      accountPrefix(SENT_PREFIX, userId),
      accountPrefix(FORM_PREFIX, userId),
    ];
    // Collecte AVANT suppression : retirer une clé pendant l'itération décale les index.
    const doomed: string[] = [];
    for (let index = 0; index < store.length; index += 1) {
      const key = store.key(index);
      if (key && prefixes.some((prefix) => key.startsWith(prefix))) doomed.push(key);
    }
    for (const key of doomed) store.removeItem(key);
  } catch {
    // Stockage indisponible : il n'y a alors aucun brouillon à effacer.
  }
}

export function clearPortalDraft(userId: string | null, objectId: string): void {
  if (!userId) return;
  removeRaw(portalDraftKey(userId, objectId));
  // La saisie en cours part avec : « Annuler mes modifications » et un envoi réussi
  // effacent le brouillon, il n'y a plus rien à reprendre dans un formulaire.
  removeRaw(portalFormKey(userId, objectId));
}

// ══════════════════════ Instantané de ce qui a été ENVOYÉ ═══════════════════

/**
 * Ce que le partenaire a envoyé, tel qu'il l'a écrit — une ligne par champ, par rubrique.
 *
 * Sans lui, un rechargement pendant la vérification remet les valeurs PUBLIÉES dans les
 * champs : le partenaire croit que son envoi s'est perdu, ressaisit de mémoire, puis bute
 * sur le refus « une vérification est déjà en cours ».
 */
export interface PortalSentSnapshot {
  submittedAt: string;
  lines: Partial<Record<string, string[]>>;
}

export function writePortalSent(userId: string | null, objectId: string, snapshot: PortalSentSnapshot): void {
  if (!userId) return;
  writeRaw(portalSentKey(userId, objectId), JSON.stringify(snapshot));
}

export function readPortalSent(userId: string | null, objectId: string): PortalSentSnapshot | null {
  if (!userId) return null;
  const raw = readRaw(portalSentKey(userId, objectId));
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (typeof record.submittedAt !== 'string') return null;
    const lines: Partial<Record<string, string[]>> = {};
    const source = record.lines;
    if (source && typeof source === 'object' && !Array.isArray(source)) {
      for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
        if (Array.isArray(value)) lines[key] = value.filter((entry): entry is string => typeof entry === 'string');
      }
    }
    return { submittedAt: record.submittedAt, lines };
  } catch {
    // Un instantané illisible ne vaut pas mieux qu'aucun : la rubrique dira seulement
    // « en vérification », sans inventer ce qui a été envoyé.
    return null;
  }
}

export function clearPortalSent(userId: string | null, objectId: string): void {
  if (!userId) return;
  removeRaw(portalSentKey(userId, objectId));
}
