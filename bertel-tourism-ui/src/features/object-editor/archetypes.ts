/**
 * Archetype identity for the 16 object type codes.
 *
 * The 16 canonical type codes collapse into 6 archetypes, each with its own
 * accent palette and ribbon metadata. Shared by the per-type detail view and
 * the full-page editor so the mapping has a single source of truth.
 */

export type ArchetypeCode = 'HEB' | 'RES' | 'ASC' | 'ITI' | 'VIS' | 'SRV';

export type DetailAccentClass =
  | 'acc-teal' | 'acc-orange' | 'acc-blue' | 'acc-green' | 'acc-plum' | 'acc-rust';

export interface ArchetypeMeta {
  archetype: ArchetypeCode;
  accent: DetailAccentClass;
  codeName: string;
  family: string;
  covers: string;
}

export const TYPE_LABEL: Record<string, string> = {
  HOT: 'Hotel',
  HPA: 'Hebergement plein air',
  HLO: 'Hebergement loisir',
  CAMP: 'Camping',
  RVA: 'Residence vacances',
  RES: 'Restaurant',
  ITI: 'Itineraire',
  FMA: 'Itineraire',
  ASC: 'Activite',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SRV: 'Service',
  VIL: 'Ville',
  COM: 'Commerce',
};

const HEB_ARCHETYPE: ArchetypeMeta = {
  archetype: 'HEB',
  accent: 'acc-teal',
  codeName: 'Hébergement marchand',
  family: 'Hôtel · Hébergement loisir · Camping · Résidence',
  covers: 'HOT · HPA · HLO · CAMP · RVA',
};

const RES_ARCHETYPE: ArchetypeMeta = {
  archetype: 'RES',
  accent: 'acc-orange',
  codeName: 'Restaurant',
  family: 'Restauration · Bar · Snack',
  covers: 'RES',
};

const ASC_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ASC',
  accent: 'acc-blue',
  codeName: 'Activité sportive & culturelle',
  family: 'Activité encadrée · Stage · Initiation',
  covers: 'ASC',
};

const ITI_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ITI',
  accent: 'acc-green',
  codeName: 'Itinéraire',
  family: 'Randonnée · Trail · VTT · Boucle',
  covers: 'ITI · FMA',
};

const VIS_ARCHETYPE: ArchetypeMeta = {
  archetype: 'VIS',
  accent: 'acc-plum',
  codeName: 'Site & visite',
  family: 'Patrimoine · Loisir · Site naturel',
  covers: 'LOI · PCU · PNA',
};

const SRV_ARCHETYPE: ArchetypeMeta = {
  archetype: 'SRV',
  accent: 'acc-rust',
  codeName: 'Service & commerce',
  family: 'OT · Commerce · Service · Ville',
  covers: 'PSV · SRV · COM · VIL',
};

export const TYPE_ARCHETYPES: Record<string, ArchetypeMeta> = {
  HOT: HEB_ARCHETYPE,
  HPA: HEB_ARCHETYPE,
  HLO: HEB_ARCHETYPE,
  CAMP: HEB_ARCHETYPE,
  RVA: HEB_ARCHETYPE,
  RES: RES_ARCHETYPE,
  ASC: ASC_ARCHETYPE,
  ITI: ITI_ARCHETYPE,
  FMA: ITI_ARCHETYPE,
  LOI: VIS_ARCHETYPE,
  PCU: VIS_ARCHETYPE,
  PNA: VIS_ARCHETYPE,
  PSV: SRV_ARCHETYPE,
  SRV: SRV_ARCHETYPE,
  VIL: SRV_ARCHETYPE,
  COM: SRV_ARCHETYPE,
};

export function getArchetypeMeta(typeCode: string | null | undefined): ArchetypeMeta | null {
  if (!typeCode) {
    return null;
  }
  return TYPE_ARCHETYPES[typeCode.toUpperCase()] ?? null;
}
