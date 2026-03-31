import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';

export interface SectionDef {
  id: WorkspaceModuleId;
  label: string;
  isVisible: (resource: ObjectWorkspaceResource) => boolean;
}

const WORKSPACE_SECTION_DEFS: SectionDef[] = [
  {
    id: 'general-info',
    label: 'Informations generales',
    isVisible: () => true,
  },
  {
    id: 'publication',
    label: 'Publication',
    isVisible: () => true,
  },
  {
    id: 'sync-identifiers',
    label: 'Synchronisation',
    isVisible: () => true,
  },
  {
    id: 'location',
    label: 'Localisation',
    isVisible: () => true,
  },
  {
    id: 'descriptions',
    label: 'Descriptions',
    isVisible: () => true,
  },
  {
    id: 'media',
    label: 'Médias',
    isVisible: () => true,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    isVisible: (resource) => resource.type !== 'ITI',
  },
  {
    id: 'characteristics',
    label: 'Équipements & services',
    isVisible: () => true,
  },
  {
    id: 'distinctions',
    label: 'Labels & certifications',
    isVisible: () => true,
  },
  {
    id: 'capacity-policies',
    label: 'Capacités',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
  {
    id: 'pricing',
    label: 'Tarifs',
    isVisible: (resource) => resource.type !== 'ITI',
  },
  {
    id: 'openings',
    label: 'Horaires',
    isVisible: () => true,
  },
  {
    id: 'provider-follow-up',
    label: 'Suivi prestataire',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
  {
    id: 'relationships',
    label: 'Rattachements',
    isVisible: () => true,
  },
  {
    id: 'memberships',
    label: 'Adhésions',
    isVisible: (resource) => resource.modules.memberships.campaignOptions.length > 0,
  },
  {
    id: 'legal',
    label: 'Documents légaux',
    isVisible: (resource) => resource.type !== 'ITI' && resource.type !== 'COM',
  },
];

export const DEFAULT_SECTION: WorkspaceModuleId = 'general-info';

export function getSectionsForResource(resource?: ObjectWorkspaceResource): SectionDef[] {
  if (!resource) {
    return WORKSPACE_SECTION_DEFS;
  }

  return WORKSPACE_SECTION_DEFS.filter((section) => section.isVisible(resource));
}
