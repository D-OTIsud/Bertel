/** Read a primitive string without trimming or coercion. */
export function readStrictString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

/** Preserve nonempty primitive strings, including whitespace-only values. */
export function readNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}
