export type LocationReferenceKind = 'postcode' | 'text';

const LOWERCASE_LOCATION_TOKENS = new Set([
  'a',
  'au',
  'aux',
  'd',
  'de',
  'des',
  'du',
  'en',
  'et',
  'l',
  'la',
  'le',
  'les',
  'sous',
  'sur',
]);

export function normalizeLocationWhitespace(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*['’]\s*/g, "'")
    .trim();
}

export function normalizePostcodeValue(value: string): string {
  return value.replace(/\D+/g, '').slice(0, 5);
}

function normalizeDisplayToken(token: string, isFirstToken: boolean): string {
  if (!token) {
    return '';
  }

  if (/\d/.test(token) && /^[A-Za-z0-9]+$/.test(token) && token.length <= 4) {
    return token.toUpperCase();
  }

  const lower = token.toLocaleLowerCase('fr');
  if (!isFirstToken && LOWERCASE_LOCATION_TOKENS.has(lower)) {
    return lower;
  }

  return lower.charAt(0).toLocaleUpperCase('fr') + lower.slice(1);
}

function normalizeApostropheWord(word: string, isFirstToken: boolean): string {
  const parts = word.split("'");
  return parts
    .map((part, index) => normalizeDisplayToken(part, isFirstToken && index === 0))
    .join("'");
}

function normalizeHyphenWord(word: string, isFirstToken: boolean): string {
  const parts = word.split('-');
  return parts
    .map((part, index) => normalizeApostropheWord(part, isFirstToken && index === 0))
    .join('-');
}

export function normalizeLocationReferenceText(value: string): string {
  const collapsed = normalizeLocationWhitespace(value);
  if (!collapsed) {
    return '';
  }

  return collapsed
    .split(' ')
    .map((word, index) => normalizeHyphenWord(word, index === 0))
    .join(' ');
}

export function normalizeLocationReferenceKey(value: string): string {
  return normalizeLocationReferenceText(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr');
}

export function normalizeLocationReferenceValue(value: string, kind: LocationReferenceKind): string {
  if (kind === 'postcode') {
    return normalizePostcodeValue(value);
  }

  return normalizeLocationReferenceText(value);
}

export function dedupeLocationReferenceValues(
  values: readonly string[],
  kind: LocationReferenceKind,
): string[] {
  const unique = new Map<string, string>();

  values.forEach((value) => {
    const normalized = normalizeLocationReferenceValue(value, kind);
    if (!normalized) {
      return;
    }

    const key = kind === 'postcode' ? normalized : normalizeLocationReferenceKey(normalized);
    if (!unique.has(key)) {
      unique.set(key, normalized);
    }
  });

  const result = Array.from(unique.values());
  result.sort((left, right) => {
    if (kind === 'postcode') {
      return left.localeCompare(right, 'fr', { numeric: true, sensitivity: 'base' });
    }

    return left.localeCompare(right, 'fr', { sensitivity: 'base' });
  });
  return result;
}
