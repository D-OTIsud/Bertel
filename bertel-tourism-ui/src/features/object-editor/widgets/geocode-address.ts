/**
 * Address standardization + geocoding via the BAN (Base Adresse Nationale),
 * `api-adresse.data.gouv.fr` — the official, keyless national address API
 * (covers La Réunion). §02 uses it two ways:
 *  - `searchAddresses` — as-you-type autocomplete on the Adresse field;
 *  - `geocodeAddress` — best match for the "Géocoder l'adresse" button.
 * Both return the BAN's STANDARDIZED address parts (name/postcode/city/citycode)
 * plus coordinates, so callers can normalize the stored address — the point of
 * the feature. The draggable pin-map stays the manual fallback.
 */

export interface GeocodeHit {
  /** 6-decimal strings, matching the editor's coordinate format. */
  latitude: string;
  longitude: string;
  /** Full standardized line, e.g. "38 Chemin Dijoux 97414 Entre-Deux". */
  label: string;
  /** Standardized street line (housenumber + street). */
  name: string;
  postcode: string;
  city: string;
  /** INSEE commune code — feeds object_location.code_insee / the Commune select. */
  citycode: string;
  /** BAN confidence (0..1) — gate writes on it; low scores can be wrong streets. */
  score: number;
}

export interface GeocodeQuery {
  address1: string;
  postcode: string;
  city: string;
}

const BAN_SEARCH_URL = 'https://api-adresse.data.gouv.fr/search/';

type BanFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    label?: string;
    name?: string;
    postcode?: string;
    city?: string;
    citycode?: string;
    score?: number;
  };
};

function toHit(feature: BanFeature): GeocodeHit | null {
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  const properties = feature.properties ?? {};
  return {
    latitude: latitude.toFixed(6),
    longitude: longitude.toFixed(6),
    label: properties.label ?? '',
    name: properties.name ?? '',
    postcode: properties.postcode ?? '',
    city: properties.city ?? '',
    citycode: properties.citycode ?? '',
    score: typeof properties.score === 'number' ? properties.score : 0,
  };
}

async function queryBan(params: URLSearchParams, fetchImpl: typeof fetch): Promise<GeocodeHit[]> {
  const response = await fetchImpl(`${BAN_SEARCH_URL}?${params.toString()}`);
  if (!response.ok) {
    throw new Error(`Géocodage indisponible (HTTP ${response.status})`);
  }
  const payload = (await response.json()) as { features?: BanFeature[] };
  return (payload.features ?? [])
    .map(toHit)
    .filter((hit): hit is GeocodeHit => hit !== null);
}

/** Best BAN match for a structured address; null when nothing matches; throws on service error. */
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

  const hits = await queryBan(params, fetchImpl);
  return hits[0] ?? null;
}

/** As-you-type suggestions (autocomplete mode); empty list for a blank/short query. */
export async function searchAddresses(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GeocodeHit[]> {
  const q = query.trim();
  if (!q) {
    return [];
  }
  const params = new URLSearchParams({ q, limit: '5', autocomplete: '1' });
  return queryBan(params, fetchImpl);
}
