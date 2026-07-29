import type { MissingEssentialBucket, MissingEssentialCode } from '../types/domain';

/**
 * §204 — vocabulaire du filtre « Remplissage », partagé par le panneau de filtres,
 * la pastille de carte et la colonne Table. Fichier séparé parce que trois
 * composants le consomment : le poser dans l'un d'eux forcerait les deux autres
 * à importer depuis un composant.
 *
 * Le mot d'interface est « remplissage », jamais « complétude ». Les codes, eux,
 * restent ceux du contrat RPC (`missing_essentials`) et ne se traduisent pas.
 */

export const REMPLISSAGE_BUCKET_OPTIONS: ReadonlyArray<{
  code: MissingEssentialBucket;
  label: string;
}> = [
  { code: 'complete', label: 'Complète' },
  { code: 'few', label: '1–2 manquants' },
  { code: 'many', label: '3 et plus' },
];

/**
 * `name` est ABSENT volontairement : 0 fiche du corpus n'a de nom vide
 * (`object.name` est structurellement rempli). L'offrir serait un critère qui ne
 * remonte jamais rien — la classe de bug que la garde CI §194 interdit. Il reste
 * compté côté SQL pour que le dénominateur /8 du Dashboard ne bouge pas.
 *
 * L'ordre suit la fréquence mesurée en base le 2026-07-29 (photos 357, bloc type
 * 172, descriptif 111, tags 27, contact 16, lieu 1, sous-catégorie 1) : le
 * critère le plus utile arrive en tête de liste.
 */
export const REMPLISSAGE_ESSENTIAL_OPTIONS: ReadonlyArray<{
  code: MissingEssentialCode;
  label: string;
}> = [
  { code: 'photos', label: 'Photos' },
  { code: 'type_block', label: 'Bloc type' },
  { code: 'description', label: 'Descriptif' },
  { code: 'tags', label: 'Tags' },
  { code: 'contact', label: 'Contact public' },
  { code: 'location', label: 'Lieu' },
  { code: 'subcategory', label: 'Sous-catégorie' },
];

const ESSENTIAL_LABELS: Record<string, string> = Object.fromEntries([
  ...REMPLISSAGE_ESSENTIAL_OPTIONS.map((o) => [o.code, o.label]),
  ['name', 'Nom'],
]);

/**
 * Libellé FR d'un code d'essentiel. Un code inconnu se rend TEL QUEL — jamais
 * vide : une pastille muette est pire qu'un code brut affiché, et un nouvel
 * essentiel ajouté côté SQL doit rester visible en attendant sa traduction.
 */
export function essentialLabel(code: string): string {
  return ESSENTIAL_LABELS[code] ?? code;
}

export type RemplissageTone = 'neutral' | 'warning' | 'danger';

/** Ton de la pastille selon le nombre de manquants. `null` = pas de pastille. */
export function remplissageTone(count: number): RemplissageTone | null {
  if (count <= 0) return null;
  if (count <= 2) return 'neutral';
  if (count === 3) return 'warning';
  return 'danger';
}

/**
 * Résumé lisible des essentiels manquants, pour un `title` de survol.
 * `undefined` quand il n'y a rien à dire — l'appelant ne doit alors POSER AUCUN
 * attribut plutôt qu'un title vide.
 */
export function remplissageDetail(missing: readonly string[] | undefined): string | undefined {
  if (!missing || missing.length === 0) return undefined;
  return `Manque : ${missing.map(essentialLabel).join(', ')}`;
}
