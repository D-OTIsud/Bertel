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
  HEB: 'Chambres & séminaire',
  RES: 'Cuisine & service',
  ASC: 'Formules & saison',
  ITI: 'Tracé & étapes',
  VIS: 'Visite & médiation',
  SRV: 'Prestations & zone',
};

export function makeSections(archetype: ArchetypeCode): SectionGroup[] {
  const hasPlaces = archetype === 'ITI' || archetype === 'VIS';
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
        { num: '05', label: TYPE_BLOCK_LABEL[archetype] },
        { num: '06', label: 'Médias' },
        { num: '07', label: 'Capacité & cadre' },
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
