/**
 * Duplicate-name hint for the create dialog (§107): as the user types a name, we surface
 * existing fiches with a similar name + their type + location, so an accidental duplicate
 * is caught before creation. A same name at a different place is legitimate, so this is
 * informational, never blocking. Exact-name matches (accent/case-insensitive) are flagged
 * more strongly.
 */
import type { ObjectSearchResult } from '../useObjectSearch';

export interface DuplicateMatch extends ObjectSearchResult {
  /** True when the existing fiche's name equals the typed name (accent/case-insensitive). */
  exact: boolean;
}

/** Accent-, case- and whitespace-insensitive normalisation for name comparison. */
export function normalizeName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** Flag exact-name matches and sort them first; preserves backend order otherwise. */
export function splitDuplicateMatches(name: string, results: ObjectSearchResult[]): DuplicateMatch[] {
  const target = normalizeName(name);
  return results
    .map((result) => ({ ...result, exact: target.length > 0 && normalizeName(result.name) === target }))
    .sort((a, b) => Number(b.exact) - Number(a.exact));
}
