/** Parse a latitude/longitude string from the workspace form (comma or dot decimals). */
export function parseCoordString(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = Number.parseFloat(trimmed.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Canonical string format written back to object_location fields. */
export function formatCoordString(value: number): string {
  return value.toFixed(6);
}

export const REUNION_MAP_CENTER = {
  longitude: 55.536384,
  latitude: -21.130568,
} as const;

export const LOCATION_MAP_DEFAULT_ZOOM = 10;
export const LOCATION_MAP_PIN_ZOOM = 14;
