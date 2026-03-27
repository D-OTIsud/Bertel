import type { LucideIcon } from 'lucide-react';
import {
  BookText,
  BriefcaseBusiness,
  Building2,
  ClipboardList,
  Gavel,
  Images,
  Landmark,
  MapPinned,
  Sparkles,
} from 'lucide-react';
import type { ObjectDrawerSection } from '../../store/object-drawer-store';

export interface SectionDef {
  id: ObjectDrawerSection;
  label: string;
  description: string;
  icon: LucideIcon;
  count?: number;
  dirty?: boolean;
}

const SECTION_ORDER: ReadonlyArray<Omit<SectionDef, 'count' | 'dirty'>> = [
  {
    id: 'overview',
    label: "Vue d'ensemble",
    description: 'Identite, textes et pilotage editorial.',
    icon: BookText,
  },
  {
    id: 'location',
    label: 'Lieu & carte',
    description: 'Adresse principale, lieux nommes et pin GPS.',
    icon: MapPinned,
  },
  {
    id: 'contacts',
    label: 'Contacts & reseau',
    description: 'Contacts publics, acteurs, organisations et adhesions.',
    icon: Building2,
  },
  {
    id: 'media',
    label: 'Media',
    description: 'Galerie principale et medias lies aux sous-surfaces.',
    icon: Images,
  },
  {
    id: 'distinctions',
    label: 'Distinctions',
    description: 'Classements, labels, amenites et cadre.',
    icon: Sparkles,
  },
  {
    id: 'offer',
    label: 'Offre & disponibilite',
    description: 'Tarifs, horaires, paiements et politiques d accueil.',
    icon: Landmark,
  },
  {
    id: 'type-details',
    label: 'Details type',
    description: 'Domaines profonds propres a la typologie.',
    icon: BriefcaseBusiness,
  },
  {
    id: 'crm',
    label: 'CRM',
    description: 'Notes, avis, interactions et suivis internes.',
    icon: ClipboardList,
  },
  {
    id: 'legal-sync',
    label: 'Juridique & sync',
    description: 'Conformite, identifiants externes et caches.',
    icon: Gavel,
  },
];

const ALL_SECTIONS = SECTION_ORDER.map((section) => section.id);

const TYPE_SECTION_MAP: Readonly<Record<string, ReadonlySet<ObjectDrawerSection>>> = {
  HOT: new Set(ALL_SECTIONS),
  HPA: new Set(ALL_SECTIONS),
  HLO: new Set(ALL_SECTIONS),
  CAMP: new Set(ALL_SECTIONS),
  RVA: new Set(ALL_SECTIONS),
  RES: new Set(ALL_SECTIONS),
  ITI: new Set(ALL_SECTIONS),
  ACT: new Set(ALL_SECTIONS),
  FMA: new Set(ALL_SECTIONS),
  LOI: new Set(ALL_SECTIONS),
  COM: new Set(['overview', 'location', 'contacts', 'media', 'distinctions', 'offer', 'crm', 'legal-sync']),
  PNA: new Set(['overview', 'location', 'contacts', 'media', 'distinctions', 'offer', 'crm', 'legal-sync']),
  ORG: new Set(['overview', 'location', 'contacts', 'media', 'crm', 'legal-sync']),
  ASC: new Set(['overview', 'location', 'contacts', 'media', 'crm', 'legal-sync']),
  PCU: new Set(['overview', 'location', 'contacts', 'media', 'crm', 'legal-sync']),
  VIL: new Set(['overview', 'location', 'contacts', 'media', 'legal-sync']),
  PSV: new Set(['overview', 'location', 'contacts', 'media', 'distinctions', 'offer', 'crm', 'legal-sync']),
};

export const DEFAULT_SECTION: ObjectDrawerSection = 'overview';

export const FIELD_SECTION_MAP: Readonly<Record<string, ObjectDrawerSection>> = {
  name: 'overview',
  description: 'overview',
  'overview.shortDescription': 'overview',
  'overview.adaptedDescription': 'overview',
  'overview.mobileDescription': 'overview',
  'overview.editorialDescription': 'overview',
  'overview.sanitaryMeasures': 'overview',
  'overview.secondaryTypes': 'overview',
  'overview.businessTimezone': 'overview',
  'overview.commercialVisibility': 'overview',
  'location.address1': 'location',
  'location.postcode': 'location',
  'location.city': 'location',
  'location.lieuDit': 'location',
  'location.direction': 'location',
  'location.latitude': 'location',
  'location.longitude': 'location',
};

export function getSectionsForType(
  objectType?: string,
  counts?: Partial<Record<string, number>>,
): SectionDef[] {
  const allowed = objectType ? TYPE_SECTION_MAP[objectType.toUpperCase()] : undefined;
  const visibleIds = allowed ?? new Set(ALL_SECTIONS);

  return SECTION_ORDER
    .filter((section) => visibleIds.has(section.id))
    .map((section) => ({
      ...section,
      count: counts?.[section.id],
    }));
}
