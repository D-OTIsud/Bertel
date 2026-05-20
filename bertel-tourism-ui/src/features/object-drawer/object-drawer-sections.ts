import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';

export interface SectionDef {
  id: WorkspaceModuleId;
  label: string;
  group: string;
  isVisible: (resource: ObjectWorkspaceResource) => boolean;
}

const ACCOMMODATION_TYPES = new Set(['HOT', 'HPA', 'HLO', 'CAMP']);

function objectType(resource: ObjectWorkspaceResource): string {
  return String(resource.type ?? '').trim().toUpperCase();
}

function hasAccommodationSurface(resource: ObjectWorkspaceResource): boolean {
  const type = objectType(resource);
  return ACCOMMODATION_TYPES.has(type) || (type === 'RVA' && resource.modules.rooms.items.length > 0);
}

function hasMeetingRoomSurface(resource: ObjectWorkspaceResource): boolean {
  const type = objectType(resource);
  return resource.modules.meetingRooms.items.length > 0 || ACCOMMODATION_TYPES.has(type) || type === 'RVA';
}

const WORKSPACE_SECTION_DEFS: SectionDef[] = [
  {
    id: 'general-info',
    label: 'Informations generales',
    group: 'Identité',
    isVisible: () => true,
  },
  {
    id: 'descriptions',
    label: 'Descriptions',
    group: 'Identité',
    isVisible: () => true,
  },
  {
    id: 'location',
    label: 'Localisation',
    group: 'Localisation & contact',
    isVisible: () => true,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    group: 'Localisation & contact',
    isVisible: (resource) => resource.type !== 'ITI',
  },
  {
    id: 'media',
    label: 'Médias',
    group: 'Localisation & contact',
    isVisible: () => true,
  },
  {
    id: 'characteristics',
    label: 'Équipements & services',
    group: 'Caractéristiques',
    isVisible: () => true,
  },
  {
    id: 'distinctions',
    label: 'Labels & certifications',
    group: 'Caractéristiques',
    isVisible: () => true,
  },
  {
    id: 'capacity-policies',
    label: 'Capacités',
    group: 'Caractéristiques',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
  {
    id: 'pricing',
    label: 'Tarifs',
    group: 'Caractéristiques',
    isVisible: (resource) => resource.type !== 'ITI',
  },
  {
    id: 'rooms',
    label: 'Chambres / unités',
    group: 'Spécifique',
    isVisible: hasAccommodationSurface,
  },
  {
    id: 'meeting-rooms',
    label: 'Salles MICE',
    group: 'Spécifique',
    isVisible: hasMeetingRoomSurface,
  },
  {
    id: 'menus',
    label: 'Menus',
    group: 'Spécifique',
    isVisible: (resource) => objectType(resource) === 'RES',
  },
  {
    id: 'activity',
    label: 'Activité',
    group: 'Spécifique',
    isVisible: (resource) => ['ACT', 'ASC'].includes(objectType(resource)),
  },
  {
    id: 'event',
    label: 'Programmation',
    group: 'Spécifique',
    isVisible: (resource) => objectType(resource) === 'FMA',
  },
  {
    id: 'itinerary',
    label: 'Itinéraire',
    group: 'Spécifique',
    isVisible: (resource) => objectType(resource) === 'ITI',
  },
  {
    id: 'openings',
    label: 'Horaires',
    group: 'Caractéristiques',
    isVisible: () => true,
  },
  {
    id: 'provider-follow-up',
    label: 'Suivi prestataire',
    group: 'Gestion',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
  {
    id: 'relationships',
    label: 'Rattachements',
    group: 'Gestion',
    isVisible: () => true,
  },
  {
    id: 'memberships',
    label: 'Adhésions',
    group: 'Gestion',
    isVisible: (resource) => resource.modules.memberships.campaignOptions.length > 0,
  },
  {
    id: 'legal',
    label: 'Documents légaux',
    group: 'Gestion',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
  {
    id: 'publication',
    label: 'Publication',
    group: 'Gestion',
    isVisible: () => true,
  },
  {
    id: 'sync-identifiers',
    label: 'Synchronisation',
    group: 'Gestion',
    isVisible: () => true,
  },
];

export const DEFAULT_SECTION: WorkspaceModuleId = 'general-info';

export function getSectionsForResource(resource?: ObjectWorkspaceResource): SectionDef[] {
  if (!resource) {
    return WORKSPACE_SECTION_DEFS;
  }

  return WORKSPACE_SECTION_DEFS.filter((section) => section.isVisible(resource));
}
