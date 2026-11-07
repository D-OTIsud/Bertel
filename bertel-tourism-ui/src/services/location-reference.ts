import { getSupabaseClient } from '../lib/supabase';
import {
  dedupeLocationReferenceValues,
  type LocationReferenceKind,
} from '../lib/location-normalization';
import { useSessionStore } from '../store/session-store';

export interface LocationReferenceOptions {
  postcodes: string[];
  cities: string[];
  lieuDits: string[];
  touristZones: string[];
}

type ObjectLocationReferenceRow = {
  postcode: string | null;
  city: string | null;
  lieu_dit: string | null;
  zone_touristique: string | null;
};

const DEMO_LOCATION_REFERENCE_OPTIONS: LocationReferenceOptions = {
  postcodes: ['97410', '97413', '97418', '97427', '97430', '97480'],
  cities: ['Cilaos', 'Etang-Sale', 'Le Tampon', 'Saint-Joseph', 'Saint-Pierre'],
  lieuDits: ['Centre Ville', 'La Plaine des Cafres', 'Parvis du Theatre'],
  touristZones: ['Sud Sauvage'],
};

function normalizeReferenceBucket(values: readonly string[], kind: LocationReferenceKind): string[] {
  return dedupeLocationReferenceValues(values, kind);
}

export async function listLocationReferenceOptions(): Promise<LocationReferenceOptions> {
  const session = useSessionStore.getState();
  const client = getSupabaseClient();

  if (session.demoMode || !client) {
    return DEMO_LOCATION_REFERENCE_OPTIONS;
  }

  const [locationCorpus, dashboardFilters] = await Promise.allSettled([
    client
      .from('object_location')
      .select('postcode, city, lieu_dit, zone_touristique')
      .eq('is_main_location', true),
    client.schema('api').rpc('get_dashboard_filter_options'),
  ]);

  const locationRows = locationCorpus.status === 'fulfilled' && !locationCorpus.value.error
    ? (locationCorpus.value.data ?? []) as ObjectLocationReferenceRow[]
    : [];
  const dashboardData = dashboardFilters.status === 'fulfilled' && !dashboardFilters.value.error
    ? dashboardFilters.value.data as { cities?: string[]; lieu_dits?: string[] } | null
    : null;

  if (
    locationRows.length === 0
    && !(dashboardData?.cities?.length)
    && !(dashboardData?.lieu_dits?.length)
  ) {
    const locationError = locationCorpus.status === 'fulfilled' ? locationCorpus.value.error : locationCorpus.reason;
    const dashboardError = dashboardFilters.status === 'fulfilled' ? dashboardFilters.value.error : dashboardFilters.reason;
    throw locationError ?? dashboardError ?? new Error('Impossible de charger les references de localisation.');
  }

  return {
    postcodes: normalizeReferenceBucket(locationRows.map((row) => row.postcode ?? ''), 'postcode'),
    cities: normalizeReferenceBucket(
      [
        ...(dashboardData?.cities ?? []),
        ...locationRows.map((row) => row.city ?? ''),
      ],
      'text',
    ),
    lieuDits: normalizeReferenceBucket(
      [
        ...(dashboardData?.lieu_dits ?? []),
        ...locationRows.map((row) => row.lieu_dit ?? ''),
      ],
      'text',
    ),
    touristZones: normalizeReferenceBucket(locationRows.map((row) => row.zone_touristique ?? ''), 'text'),
  };
}
