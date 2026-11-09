import 'server-only';
import { createHash } from 'node:crypto';

/** Server-owned beta definitions. IDs survive renames and later storage in the database. */
export interface PartnerSelectionBucket {
  types: readonly string[];
  filters?: Record<string, unknown>;
  search?: string | null;
  only_without_practices?: boolean;
}

export interface PartnerSelection {
  id: string;
  name: string;
  revision: number;
  buckets: readonly PartnerSelectionBucket[];
  communeInsee: readonly string[] | null;
}

const OTI_SUD_COMMUNES = ['97403', '97412', '97417', '97422'] as const;
const taxonomy = (domain: string, codes: readonly string[]) => ({
  taxonomy_any: codes.map((code) => ({ domain, code })),
});
const selection = (id: string, name: string, buckets: PartnerSelectionBucket[]): PartnerSelection => ({
  id, name, revision: 1, buckets, communeInsee: OTI_SUD_COMMUNES,
});

/** Guides and maps are editorial content, so they have no objects selection. */
export const PARTNER_SELECTIONS: readonly PartnerSelection[] = [
  selection('1001', 'À pied', [
    { types: ['ITI'], filters: { itinerary: { practices_any: ['randonnee_pedestre'] } } },
    { types: ['ITI'], filters: taxonomy('taxonomy_iti', ['hiking', 'interpretive_trail', 'coastal_path']), only_without_practices: true },
  ]),
  selection('1002', 'À vélo', [
    { types: ['ITI'], filters: { itinerary: { practices_any: ['velo_route', 'velo_vtt', 'cyclotourisme'] } } },
    { types: ['ITI'], filters: taxonomy('taxonomy_iti', ['mountain_biking']), only_without_practices: true },
  ]),
  selection('1003', 'Nature', [{ types: ['PNA'] }]),
  selection('1004', 'Patrimoine', [{ types: ['PCU'] }]),
  selection('1005', 'Loisirs', [{ types: ['ACT', 'ASC', 'LOI'] }]),
  selection('1006', 'Terroir et artisanat', [
    { types: ['PRD'] },
    { types: ['COM'], filters: taxonomy('taxonomy_com', ['local_crafts', 'weekly_market', 'covered_market']) },
  ]),
  // Dates, occurrences and cancellations still need processing by the consumer in this beta.
  selection('1007', 'Événements', [{ types: ['FMA'] }]),
  selection('1008', 'Restaurants', [{ types: ['RES'] }]),
  selection('1009', 'Hôtels', [{ types: ['HOT'] }]),
  selection('1010', 'Locations et chambres', [{ types: ['HLO'] }]),
  selection('1011', 'Campings et aires', [{ types: ['CAMP', 'HPA'] }]),
  selection('1012', 'Résidences', [{ types: ['RVA'] }]),
  selection('1013', 'Transports', [
    { types: ['PSV'], filters: taxonomy('taxonomy_psv', ['transport_mobility', 'autocar_compagnie', 'location_vehicule', 'cycle_scooter_rental']) },
    { types: ['SPU'], filters: taxonomy('taxonomy_spu', ['bus_station', 'carpool_area', 'tourist_parking']) },
  ]),
  selection('1014', 'Offices de tourisme', [
    { types: ['SPU'], filters: taxonomy('taxonomy_spu', ['tourist_info_office']) },
  ]),
  selection('1015', 'Services', [
    { types: ['SPU'], filters: taxonomy('taxonomy_spu', ['public_toilets', 'drinking_water', 'picnic_area', 'electric_charging', 'motorhome_services']) },
  ]),
];

const selectionsById = new Map(PARTNER_SELECTIONS.map((item) => [item.id, item]));

export function getPartnerSelection(id: string): PartnerSelection | undefined {
  return selectionsById.get(id);
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** Bind pagination to the actual definition, including changes made without a revision bump. */
export function selectionDefinitionHash(item: PartnerSelection): string {
  return createHash('sha256').update(canonicalJson({
    id: item.id, revision: item.revision, buckets: item.buckets, communeInsee: item.communeInsee,
  })).digest('hex');
}
