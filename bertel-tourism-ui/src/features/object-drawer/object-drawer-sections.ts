import type { ObjectDrawerSection } from '../../store/object-drawer-store';

export interface SectionDef {
  id: ObjectDrawerSection;
  label: string;
}

// Canonical section list in display order.
// Single source of truth for section ordering and labels across nav and shell.
const ALL_SECTION_DEFS: SectionDef[] = [
  { id: 'general',       label: 'General' },
  { id: 'contacts',      label: 'Contacts' },
  { id: 'media',         label: 'Media' },
  { id: 'legal',         label: 'Legal' },
  { id: 'pricing',       label: 'Tarifs' },
  { id: 'openings',      label: 'Ouvertures' },
  { id: 'rooms',         label: 'Chambres' },
  { id: 'mice',          label: 'MICE' },
  { id: 'memberships',   label: 'Adhesions' },
  { id: 'external-sync', label: 'Sync' },
];

// Sections exposed for every object type in edit mode.
const CORE: ObjectDrawerSection[] = ['general', 'contacts', 'media', 'legal', 'external-sync'];

function sectionSet(...extra: ObjectDrawerSection[]): ReadonlySet<ObjectDrawerSection> {
  return new Set([...CORE, ...extra]);
}

// Per-type section visibility.
// Types absent from this map fall back to ALL_SECTION_DEFS (safe for unknown codes).
const TYPE_SECTION_MAP: Readonly<Record<string, ReadonlySet<ObjectDrawerSection>>> = {
  // Accommodation — HOT is the only type with dedicated meeting rooms (MICE)
  HOT:  sectionSet('pricing', 'openings', 'rooms', 'mice', 'memberships'),
  HPA:  sectionSet('pricing', 'openings', 'rooms', 'memberships'),
  HLO:  sectionSet('pricing', 'openings', 'rooms', 'memberships'),
  CAMP: sectionSet('pricing', 'openings', 'rooms', 'memberships'),
  RVA:  sectionSet('pricing', 'openings', 'memberships'),

  // Restaurant
  RES:  sectionSet('pricing', 'openings', 'memberships'),

  // Itinerary — no commercial or capacity sections
  ITI:  sectionSet('openings'),
  FMA:  sectionSet('openings'),

  // Activity / guided prestation
  ASC:  sectionSet('pricing', 'openings', 'memberships'),

  // Visitable — commercial
  LOI:  sectionSet('pricing', 'openings', 'memberships'),
  // Visitable — heritage / cultural (no membership)
  PCU:  sectionSet('pricing', 'openings'),

  // Service provider (no openings — services are available on demand)
  PSV:  sectionSet('pricing', 'memberships'),

  // Natural site / protected area
  PNA:  sectionSet('openings'),

  // Administrative / geographic references — edit surface minimal
  VIL:  new Set<ObjectDrawerSection>(CORE),
  COM:  new Set<ObjectDrawerSection>(CORE),
};

/** The default edit section — always present in every type's allowed set. */
export const DEFAULT_SECTION: ObjectDrawerSection = 'general';

/**
 * Returns the ordered section definitions visible in edit mode for a given object type.
 * Falls back to all sections for unrecognised type codes so new types degrade gracefully.
 */
export function getSectionsForType(objectType?: string): SectionDef[] {
  if (!objectType) {
    return ALL_SECTION_DEFS;
  }
  const allowed = TYPE_SECTION_MAP[objectType.toUpperCase()];
  if (!allowed) {
    return ALL_SECTION_DEFS;
  }
  return ALL_SECTION_DEFS.filter((s) => allowed.has(s.id));
}
