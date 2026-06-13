import type { ArchetypeCode } from './archetypes';

/**
 * The 22-section definition that drives the editor's left nav and the order of
 * section cards in the main column. Section 16 (Lieux & étapes / Sous-lieux)
 * applies only to ITI and VIS archetypes.
 */

export interface SectionItem {
  num: string;
  label: string;
}

export interface SectionGroup {
  group: string;
  items: SectionItem[];
}

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
  const hasPlaces = archetype === 'ITI' || archetype === 'VIS';
  // §06 absorbe la capacité d'accueil pour les hébergements (audit live 2026-06-13 :
  // 0 type de chambre en base, 496 HEB ne portent que max_capacity en §07 ; un seul
  // bloc « fait foi »). §07 reste rendu pour tous les autres archétypes.
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
        { num: '04', label: 'Descriptions' },
        // Renumbered 2026-06-11 (user): Médias is 05 and the type block 06, so the
        // rooms/equipment inventory sits right before the Capacité it feeds (§07).
        { num: '05', label: 'Médias' },
        { num: '06', label: TYPE_BLOCK_LABEL[archetype] },
        ...(isHeb ? [] : [{ num: '07', label: 'Capacité & accueil' }]),
        { num: '08', label: 'Classifications' },
        { num: '09', label: 'Tags & étiquettes' },
        { num: '10', label: 'Accessibilité' },
        { num: '11', label: 'Démarche durable' },
        { num: '12', label: 'Paiements & langues' },
      ],
    },
    {
      group: 'Tarifs & ouverture',
      items: [
        { num: '13', label: 'Tarifs & extras' },
        { num: '14', label: "Périodes d'ouverture" },
      ],
    },
    {
      group: 'Liens & territoire',
      items: [
        { num: '15', label: 'Liens vers fiches' },
        ...(hasPlaces
          ? [{ num: '16', label: archetype === 'ITI' ? 'Lieux & étapes' : 'Sous-lieux' }]
          : []),
        { num: '17', label: 'Rattachements' },
      ],
    },
    {
      group: 'Gestion',
      items: [
        { num: '18', label: 'Fournisseur' },
        { num: '19', label: 'Suivi prestataire' },
        { num: '20', label: 'Distribution' },
        { num: '21', label: 'Publication' },
        { num: '22', label: 'Identifiants externes' },
      ],
    },
  ];
}
