import { randomUUID } from 'node:crypto';

// Format des clés du bucket `avatars`, partagé entre l'écriture et le nettoyage RGPD.
// Clé historique : `<user>/avatar.jpg` (réécrite en place, encore référencée par d'anciennes URL).
// Génération : `<user>/avatar-<uuid v4>.jpg` (jamais réécrite).
const LEGACY_AVATAR_FILE = 'avatar.jpg';
const AVATAR_GENERATION_FILE_RE =
  /^avatar-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.jpg$/;

export function newAvatarStoragePath(ownerId: string): string {
  return `${ownerId}/avatar-${randomUUID()}.jpg`;
}

/** Vrai uniquement pour l'une des deux formes exactes, directement sous le préfixe de `ownerId`. */
export function isAvatarStoragePathOwnedBy(path: string, ownerId: string): boolean {
  const segments = path.split('/');
  if (segments.length !== 2) return false;
  const [owner, file] = segments;
  return owner === ownerId && (file === LEGACY_AVATAR_FILE || AVATAR_GENERATION_FILE_RE.test(file));
}
