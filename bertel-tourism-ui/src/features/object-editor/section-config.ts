import type { ArchetypeCode } from './archetypes';

/**
 * Type-specific sections drive the editor's nav and the order of cards.
 * Section 16 (Territoire traversé / Sites secondaires)
 * is shown for every archetype (plan §182: sites secondaires are a general-purpose
 * concept, not ITI/VIS-specific).
 */

export interface SectionItem {
  num: string;
  label: string;
}

export interface SectionGroup {
  group: string;
  items: SectionItem[];
}

/** Shared destinations for cross-section guidance, consumed by the nav and hints. */
export const EDITOR_SECTION_REFERENCES = {
  languages: { num: '04', label: 'Descriptions & langues parlées' },
  accessibility: { num: '09', label: 'Accessibilité' },
  openings: { num: '14', label: "Périodes d'ouverture" },
  attachments: { num: '17', label: 'Rattachements' },
  provider: { num: '19', label: 'Suivi prestataire' },
} as const;

const TYPE_BLOCK_LABEL: Record<ArchetypeCode, string> = {
  HEB: 'Chambres & capacité',
  RES: 'Cuisine & service',
  ASC: 'Fiche activité',
  ITI: 'Tracé & étapes',
  VIS: 'Visite & médiation',
  SRV: 'Prestations',
  FMA: 'Dates & programmation',
};

export function makeSections(archetype: ArchetypeCode): SectionGroup[] {
  if (archetype === 'ITI') {
    return [
      { group: 'Présentation', items: [
        { num: '01', label: 'Identité de l’itinéraire' },
        { num: '02', label: 'Départ & accès' },
        { num: '03', label: 'Contacts' },
        { num: '04', label: 'Descriptions & traductions' },
        { num: '05', label: 'Photos & vidéos' },
      ] },
      { group: 'Le parcours', items: [
        { num: '06', label: 'Tracé, étapes & praticabilité' },
        { num: '09', label: 'Accessibilité du parcours' },
        { num: '13', label: 'Accès & conditions' },
        { num: '16', label: 'Territoire traversé' },
        { num: '15', label: 'Fiches liées' },
      ] },
      { group: 'Référencement', items: [
        { num: '08', label: 'Labels & homologations' },
        { num: '10', label: 'Préservation du milieu' },
        { num: '11', label: 'Tags & étiquettes' },
      ] },
      { group: 'Gestion', items: [
        { num: '17', label: 'Organisations' },
        { num: '18', label: 'Réglementation & documents' },
        { num: '19', label: 'Gestionnaires & suivi' },
        { num: '21', label: 'Publication' },
        { num: '22', label: 'Identifiants sources' },
      ] },
    ];
  }
  const isHeb = archetype === 'HEB';
  return [
    {
      group: 'Identité',
      items: [
        { num: '01', label: 'Identité & taxonomie' },
        { num: '02', label: 'Localisation' },
        { num: '03', label: 'Contacts' },
      ],
    },
    {
      group: 'Caractéristiques',
      items: [
        { ...EDITOR_SECTION_REFERENCES.languages },
        // Renumbered 2026-06-11 (user): Médias is 05 and the type block 06, so the
        // rooms/equipment inventory sits right before the Capacité it feeds (§07).
        { num: '05', label: 'Médias' },
        { num: '06', label: TYPE_BLOCK_LABEL[archetype] },
        ...(isHeb ? [] : [{ num: '07', label: 'Capacité & accueil' }]),
        { num: '08', label: 'Classifications' },
        // Renumbered 2026-06-15 (user): labels (T&H, durabilité) are held in §08 now, so the
        // two label-detail sections sit right after §08 and Tags (display layer) drops to 11.
        { ...EDITOR_SECTION_REFERENCES.accessibility },
        { num: '10', label: 'Démarche durable' },
        { num: '11', label: 'Tags & étiquettes' },
      ],
    },
    {
      group: 'Tarifs & ouverture',
      items: [
        { num: '13', label: 'Tarifs, paiement & extras' },
        { ...EDITOR_SECTION_REFERENCES.openings },
      ],
    },
    {
      group: 'Liens & territoire',
      items: [
        { num: '15', label: 'Liens vers fiches' },
        { num: '16', label: 'Sites secondaires' },
        { ...EDITOR_SECTION_REFERENCES.attachments },
      ],
    },
    {
      group: 'Gestion',
      items: [
        { num: '18', label: 'Juridique' },
        { ...EDITOR_SECTION_REFERENCES.provider },
        { num: '21', label: 'Publication' },
        { num: '22', label: 'Identifiants externes' },
      ],
    },
  ];
}
