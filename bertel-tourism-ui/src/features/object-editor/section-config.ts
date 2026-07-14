import type { ArchetypeCode } from './archetypes';

/**
 * The 22-section definition that drives the editor's left nav and the order of
 * section cards in the main column. Section 16 (Lieux & étapes / Sites secondaires)
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
        { num: '04', label: 'Descriptions & langues parlées' },
        // Renumbered 2026-06-11 (user): Médias is 05 and the type block 06, so the
        // rooms/equipment inventory sits right before the Capacité it feeds (§07).
        { num: '05', label: 'Médias' },
        { num: '06', label: TYPE_BLOCK_LABEL[archetype] },
        ...(isHeb ? [] : [{ num: '07', label: 'Capacité & accueil' }]),
        { num: '08', label: 'Classifications' },
        // Renumbered 2026-06-15 (user): labels (T&H, durabilité) are held in §08 now, so the
        // two label-detail sections sit right after §08 and Tags (display layer) drops to 11.
        { num: '09', label: 'Accessibilité' },
        { num: '10', label: 'Démarche durable' },
        { num: '11', label: 'Tags & étiquettes' },
      ],
    },
    {
      group: 'Tarifs & ouverture',
      items: [
        { num: '13', label: 'Tarifs, paiement & extras' },
        { num: '14', label: "Périodes d'ouverture" },
      ],
    },
    {
      group: 'Liens & territoire',
      items: [
        { num: '15', label: 'Liens vers fiches' },
        { num: '16', label: archetype === 'ITI' ? 'Lieux & étapes' : 'Sites secondaires' },
        { num: '17', label: 'Rattachements' },
      ],
    },
    {
      group: 'Gestion',
      items: [
        { num: '18', label: 'Juridique' },
        { num: '19', label: 'Suivi prestataire' },
        { num: '21', label: 'Publication' },
        { num: '22', label: 'Identifiants externes' },
      ],
    },
  ];
}
