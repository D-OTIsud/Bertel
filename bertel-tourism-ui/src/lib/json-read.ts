/** Read a primitive string without trimming or coercion. */
export function readStrictString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Preserve nonempty primitive strings, including whitespace-only values. */
export function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Preserve strings and stringify primitive numbers; do not coerce other values. */
export function readCoercingString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

/** Accept the workspace's true/1/yes/oui tokens; unknown values remain false. */
export function readPermissiveBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['true', '1', 'yes', 'oui'].includes(value.trim().toLowerCase());
  }
  if (typeof value === 'number') {
    return value === 1;
  }
  return false;
}

/** Trim strings and numeric text in array order, retaining duplicates and dropping empty text. */
export function readTrimmedStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => readCoercingString(entry).trim())
    .filter(Boolean);
}
