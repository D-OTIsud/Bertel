/** Accept non-null objects, including class instances, but never arrays. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Draft snapshots require plain objects; service payload readers also accept instances. */
export function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}

/** Return the original object, or a fresh empty record for an unsupported value. */
export function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

/** Preserve the portal's distinction between a missing record and an empty one. */
export function readRecordOrNull(value: unknown): Record<string, unknown> | null {
  return isRecord(value) ? value : null;
}

/** Preserve array identity, entries and holes; ignore non-array iterables. */
export function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Keep only non-array objects, preserving their identity and order. */
export function readRecordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

/** Trim primitive strings without converting numbers or objects. */
export function readTrimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

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
