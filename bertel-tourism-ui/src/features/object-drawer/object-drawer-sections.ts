import type { ObjectWorkspaceResource, WorkspaceModuleId } from '../../services/object-workspace';

export interface SectionDef {
  id: WorkspaceModuleId;
  label: string;
  eyebrow: string;
  description: string;
  isVisible: (resource: ObjectWorkspaceResource) => boolean;
}

const WORKSPACE_SECTION_DEFS: SectionDef[] = [
  {
    id: 'general-info',
    label: 'Infos generales',
    eyebrow: 'A1',
    description: 'Identite, cadrage metier et visibilite commerciale.',
    isVisible: () => true,
  },
  {
    id: 'taxonomy',
    label: 'Taxonomie',
    eyebrow: 'A2',
    description: 'Classifications structurantes sans melanger distinctions et labels.',
    isVisible: () => true,
  },
  {
    id: 'publication',
    label: 'Publication',
    eyebrow: 'A3',
    description: 'Workflow editorial, publication et moderation.',
    isVisible: () => true,
  },
  {
    id: 'location',
    label: 'Localisation',
    eyebrow: 'B1',
    description: 'Adresse principale, sous-lieux et coherence territoriale.',
    isVisible: () => true,
  },
  {
    id: 'descriptions',
    label: 'Descriptions',
    eyebrow: 'B2',
    description: 'Contenus multilingues et scopes objet / sous-lieu.',
    isVisible: () => true,
  },
  {
    id: 'media',
    label: 'Medias',
    eyebrow: 'B3',
    description: 'Galerie, droits, media principal et portee.',
    isVisible: () => true,
  },
  {
    id: 'contacts',
    label: 'Contacts',
    eyebrow: 'B4',
    description: 'Coordonnees publiques propres a l objet.',
    isVisible: () => true,
  },
  {
    id: 'characteristics',
    label: 'Caracteristiques',
    eyebrow: 'C1',
    description: 'Langues, equipements, paiements et environnement.',
    isVisible: () => true,
  },
  {
    id: 'distinctions',
    label: 'Distinctions',
    eyebrow: 'C2',
    description: 'Distinctions certifiees, labels d accessibilite et couverture accessibilite.',
    isVisible: () => true,
  },
  {
    id: 'capacity-policies',
    label: 'Capacites',
    eyebrow: 'C4',
    description: 'Capacites metier, groupes et animaux.',
    isVisible: () => true,
  },
  {
    id: 'pricing',
    label: 'Tarifs',
    eyebrow: 'C5',
    description: 'Tarifs, periodes, remises bornees et promotions liees.',
    isVisible: () => true,
  },
  {
    id: 'openings',
    label: 'Horaires',
    eyebrow: 'C6',
    description: 'Periodes d ouverture et creneaux par jour sans flattening preview.',
    isVisible: () => true,
  },
  {
    id: 'provider-follow-up',
    label: 'Suivi relation',
    eyebrow: 'D1',
    description: 'Notes internes et memoire de relation prestataire, sans pipeline commercial.',
    isVisible: () => true,
  },
  {
    id: 'relationships',
    label: 'Relations',
    eyebrow: 'D2',
    description: 'Rattachements ORG, acteurs lies et relations objet sans les confondre avec les contacts publics.',
    isVisible: () => true,
  },
  {
    id: 'memberships',
    label: 'Adhesions',
    eyebrow: 'D3',
    description: 'Suivi des adhesions objet et organisationnelles, sans pipeline commercial.',
    isVisible: () => true,
  },
  {
    id: 'legal',
    label: 'Conformite',
    eyebrow: 'D6',
    description: 'Documents juridiques, echeances et resume de conformite.',
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
