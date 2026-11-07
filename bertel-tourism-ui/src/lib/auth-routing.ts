import type { UserRole } from '@/types/domain';

/** Racine de l'Espace partenaire (18a) — tout le périmètre de la persona `actor`. */
const PORTAL_ROOT = '/espace';
const INTERNAL_ORIGIN = 'https://bertel.invalid';

function resolveInternalPath(path: string | null | undefined): URL | null {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')
    || /[\\\u0000-\u001f\u007f]/.test(path)) return null;
  try {
    const resolved = new URL(path, INTERNAL_ORIGIN);
    return resolved.origin === INTERNAL_ORIGIN ? resolved : null;
  } catch {
    return null;
  }
}

export function isSafeInternalPath(path: string | null | undefined): path is string {
  return resolveInternalPath(path) !== null;
}

/**
 * Vrai quand le chemin est DANS le portail, frontière de segment comprise. Un
 * `startsWith('/espace')` nu laisserait passer « /espaces-verts » : le préfixe doit
 * être suivi d'une fin de chemin, d'un séparateur, d'une query ou d'un fragment.
 */
export function isPortalPath(path: string): boolean {
  const pathname = resolveInternalPath(path)?.pathname;
  return pathname === PORTAL_ROOT || Boolean(pathname?.startsWith(`${PORTAL_ROOT}/`));
}

export function getDefaultAppPath(role: UserRole | null): string {
  // Persona partenaire (18a) : le portail est TOUT son périmètre. Sans ce cas, il
  // atterrirait sur /explorer, c'est-à-dire l'annuaire interne de l'office.
  if (role === 'actor') return PORTAL_ROOT;
  return role === 'owner' ? '/dashboard' : '/explorer';
}

export function getLoginPath(from: string | null | undefined): string {
  return isSafeInternalPath(from) ? `/login?from=${encodeURIComponent(from)}` : '/login';
}

export function getPostLoginPath(role: UserRole | null, from: string | null | undefined): string {
  if (role === 'actor') {
    // Allowlist portail : un ?from= back-office (ou hostile) ne fait jamais sortir un
    // partenaire du portail — la vraie barrière reste RLS/RPC côté base, mais l'URL de
    // destination ne doit même pas être tentée.
    return isSafeInternalPath(from) && isPortalPath(from) ? from : PORTAL_ROOT;
  }
  return isSafeInternalPath(from) ? from : getDefaultAppPath(role);
}
