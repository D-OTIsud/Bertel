/**
 * Résolution « plateforme web » d'un contact à partir de sa valeur.
 *
 * Source unique de vérité partagée par l'éditeur (Section 03 Contacts) et le drawer
 * (`ContactCard`). La détection est pilotée par la VALEUR (est-ce une URL ?), pas par
 * une liste de types de contact codée en dur : tout contact dont la valeur est une URL
 * web (site, plateforme de réservation, réseau social…) reçoit le traitement favicon.
 *
 * Voir docs/superpowers/specs/2026-06-01-contact-web-platform-display-design.md
 */

export interface WebPlatform {
  /** Hôte normalisé, minuscule, sans « www. » de tête (ex. « booking.com »). */
  hostname: string;
  /** Nom propre si la plateforme est connue, sinon le nom de domaine (repli). */
  displayName: string;
  /** URL du favicon via le fournisseur (DuckDuckGo par défaut). */
  faviconUrl: string;
}

/**
 * Table curée clé → nom affichable.
 * - clé-domaine (contient un point, ex. `booking.com`) : match si l'hôte est égal à la
 *   clé ou s'il se termine par `.<clé>` (couvre les sous-domaines).
 * - clé-marque (sans point, ex. `airbnb`) : match si un LABEL de l'hôte est égal à la clé
 *   (couvre les TLD multiples : airbnb.fr, airbnb.co.uk). Jamais une sous-chaîne.
 * Extensible sans risque : tout domaine absent retombe sur son nom de domaine.
 */
const DOMAIN_NAMES: Record<string, string> = {
  'booking.com': 'Booking.com',
  airbnb: 'Airbnb',
  'abritel.fr': 'Abritel',
  'vrbo.com': 'Vrbo',
  expedia: 'Expedia',
  'hotels.com': 'Hotels.com',
  tripadvisor: 'TripAdvisor',
  'gites-de-france.com': 'Gîtes de France',
  'leboncoin.fr': 'leboncoin',
  'facebook.com': 'Facebook',
  'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn',
  'youtube.com': 'YouTube',
  'tiktok.com': 'TikTok',
  'x.com': 'X',
  'twitter.com': 'X',
};

/**
 * Fournisseur de favicon — point d'échange unique. DuckDuckGo par défaut (plus
 * respectueux de la vie privée). Pour basculer sur Google s2, remplacer le corps par :
 * `https://www.google.com/s2/favicons?domain=${host}&sz=64`.
 */
function faviconUrl(host: string): string {
  return `https://icons.duckduckgo.com/ip3/${host}.ico`;
}

/**
 * Parsing défensif via le constructeur `URL` (pas de regex maison fragile).
 * Retourne `null` si la valeur n'est pas une URL web exploitable.
 */
function toWebUrl(value: string): URL | null {
  const raw = value.trim();
  if (!raw || raw.includes('@')) return null; // exclut e-mails et userinfo
  const candidate = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (!url.hostname.toLowerCase().includes('.')) return null; // rejette localhost, handles
    return url;
  } catch {
    return null;
  }
}

/** Cherche le nom propre d'un hôte normalisé dans la table curée. */
function lookupDisplayName(hostname: string): string | null {
  const labels = hostname.split('.');
  for (const [key, name] of Object.entries(DOMAIN_NAMES)) {
    if (key.includes('.')) {
      if (hostname === key || hostname.endsWith(`.${key}`)) {
        return name;
      }
    } else if (labels.includes(key)) {
      return name;
    }
  }
  return null;
}

/**
 * Dérive l'identité de plateforme d'une valeur de contact.
 * @returns `{ hostname, displayName, faviconUrl }` ou `null` si la valeur n'est pas une URL web.
 */
export function resolveWebPlatform(value: string): WebPlatform | null {
  const url = toWebUrl(value);
  if (!url) {
    return null;
  }
  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  return {
    hostname,
    displayName: lookupDisplayName(hostname) ?? hostname,
    faviconUrl: faviconUrl(hostname),
  };
}
