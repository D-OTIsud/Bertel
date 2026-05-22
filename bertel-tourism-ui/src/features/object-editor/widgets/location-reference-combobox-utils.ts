import {
  normalizeLocationReferenceKey,
  normalizeLocationReferenceText,
} from '../../../lib/location-normalization';

export function filterLocationReferenceOptions(
  options: readonly string[],
  query: string,
  limit = 40,
): string[] {
  const queryKey = normalizeLocationReferenceKey(query);
  if (!queryKey) {
    return options.slice(0, limit);
  }
  return options
    .filter((option) => normalizeLocationReferenceKey(option).includes(queryKey))
    .slice(0, limit);
}

export function locationReferenceValueExists(options: readonly string[], value: string): boolean {
  const key = normalizeLocationReferenceKey(value);
  if (!key) {
    return false;
  }
  return options.some((option) => normalizeLocationReferenceKey(option) === key);
}

/** Normalized label for a new reference value, or null when query is empty. */
export function resolveLocationReferenceCreateValue(query: string): string | null {
  const normalized = normalizeLocationReferenceText(query);
  return normalized || null;
}

export function canCreateLocationReferenceValue(options: readonly string[], query: string): boolean {
  const normalized = resolveLocationReferenceCreateValue(query);
  if (!normalized) {
    return false;
  }
  return !locationReferenceValueExists(options, normalized);
}
