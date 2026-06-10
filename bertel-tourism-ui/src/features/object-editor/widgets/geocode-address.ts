/**
 * Address → GPS via the BAN (Base Adresse Nationale) geocoder,
 * `api-adresse.data.gouv.fr` — official, keyless, covers La Réunion.
 * Used by §02's "Géocoder l'adresse"; the draggable pin-map stays the manual fallback.
 */

export interface GeocodeHit {
  /** 6-decimal strings, matching the editor's coordinate format. */
  latitude: string;
  longitude: string;
  /** The BAN's matched address label (for feedback/debug). */
  label: string;
}

export interface GeocodeQuery {
  address1: string;
  postcode: string;
  city: string;
}

const BAN_SEARCH_URL = 'https://api-adresse.data.gouv.fr/search/';

/** Returns the best BAN match, null when nothing matches; throws when the service errors. */
export async function geocodeAddress(
  query: GeocodeQuery,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeHit | null> {
  const q = [query.address1, query.postcode, query.city]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(' ');
  if (!q) {
    return null;
  }

  const params = new URLSearchParams({ q, limit: '1' });
  // The postcode filter sharpens BAN ranking — only when it is a real 5-digit code.
  if (/^\d{5}$/.test(query.postcode.trim())) {
    params.set('postcode', query.postcode.trim());
  }

  const response = await fetchImpl(`${BAN_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Géocodage indisponible (HTTP ${response.status})`);
  }

  const payload = (await response.json()) as {
    features?: { geometry?: { coordinates?: number[] }; properties?: { label?: string } }[];
  };
  const feature = payload.features?.[0];
  const [longitude, latitude] = feature?.geometry?.coordinates ?? [];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }

  return {
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
    label: feature?.properties?.label ?? '',
  };
}
