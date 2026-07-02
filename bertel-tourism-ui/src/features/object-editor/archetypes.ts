/**
 * Archetype identity for the editor's object type codes.
 *
 * Keys = the DB `object_type` enum MINUS ORG (ORG is deliberately unmapped —
 * the editor renders an explicit unsupported-type panel; ORGs are managed via
 * /team administration). The mapped codes collapse into 7 archetypes, each with
 * its own accent palette and ribbon metadata. Shared by the per-type detail view
 * and the full-page editor so the mapping has a single source of truth.
 * SRV/HEB/VIS are archetype names, NOT DB types. See decision log §46.
 *
 * §48 (2026-06-10): ACT maps to the ASC archetype (NOT SRV). BlockASC is the
 * editor block that reaches the `object_act` facet table; DB applicability
 * registry (`ref_facet_applicability`) allows object_act for both ASC and ACT.
 * ASC_ARCHETYPE.covers now includes ACT; SRV_ARCHETYPE.covers/family no longer
 * list ACT. Likewise FMA gets its OWN archetype (was collapsed into ITI, which
 * gave events a trail/GPX editor and no UI for `object_fma` dates/occurrences) —
 * BlockFMA is the editor block that reaches object_fma + object_fma_occurrence.
 * See decision log §48.
 */

export type ArchetypeCode = 'HEB' | 'RES' | 'ASC' | 'ITI' | 'VIS' | 'SRV' | 'FMA';

export type DetailAccentClass =
  | 'acc-teal' | 'acc-orange' | 'acc-blue' | 'acc-green' | 'acc-plum' | 'acc-rust';

export interface ArchetypeMeta {
  archetype: ArchetypeCode;
  accent: DetailAccentClass;
  codeName: string;
  family: string;
  covers: string;
}

// §153 (P0-a audit filtres) : libellés accentués, vocabulaire conseiller.
// HLO « Gîte & meublé » : 171/180 hébergements publiés sont des HLO et « gîte »
// était introuvable dans l'UI (l'ancien « Hébergement loisir » ne parle à personne).
export const TYPE_LABEL: Record<string, string> = {
  HOT: 'Hôtel',
  HPA: 'Hôtellerie de plein air',
  HLO: 'Gîte & meublé',
  CAMP: 'Camping',
  RVA: 'Résidence de vacances',
  RES: 'Restaurant',
  ITI: 'Itinéraire',
  FMA: 'Fête / manifestation',
  ASC: 'Activité',
  LOI: 'Loisir',
  PCU: 'Patrimoine',
  PNA: 'Site naturel',
  PSV: 'Prestataire',
  SPU: 'Service public',
  PRD: 'Producteur',
  VIL: 'Ville',
  COM: 'Commerce',
  ACT: 'Activité encadrée',
  ORG: 'Organisation',
};

const HEB_ARCHETYPE: ArchetypeMeta = {
  archetype: 'HEB',
  accent: 'acc-teal',
  codeName: 'Hébergement',
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
  covers: 'ASC · ACT',
};

const ITI_ARCHETYPE: ArchetypeMeta = {
  archetype: 'ITI',
  accent: 'acc-green',
  codeName: 'Itinéraire',
  family: 'Randonnée · Trail · VTT · Boucle',
  covers: 'ITI',
};

const FMA_ARCHETYPE: ArchetypeMeta = {
  archetype: 'FMA',
  accent: 'acc-orange', // reuses the RES palette — no new CSS accent class required
  codeName: 'Fête & manifestation',
  family: 'Événement · Animation · Manifestation',
  covers: 'FMA',
};

const VIS_ARCHETYPE: ArchetypeMeta = {
  archetype: 'VIS',
  accent: 'acc-plum',
  codeName: 'Site & visite',
  family: 'Patrimoine · Loisir · Site naturel · Producteur',
  covers: 'LOI · PCU · PNA · PRD',
};

const SRV_ARCHETYPE: ArchetypeMeta = {
  archetype: 'SRV',
  accent: 'acc-rust',
  codeName: 'Service & commerce',
  family: 'OT · Commerce · Service · Service public',
  covers: 'PSV · VIL · COM · SPU',
};

// Keys = DB object_type enum minus ORG (ORG is deliberately unmapped: the editor renders an
// explicit unsupported-type panel; see ObjectEditPage). SRV/HEB/VIS are archetype names, NOT DB types.
// ACT → ASC_ARCHETYPE (§48): BlockASC reaches the object_act facet; applicability = ASC+ACT per DB registry.
export const TYPE_ARCHETYPES: Record<string, ArchetypeMeta> = {
  HOT: HEB_ARCHETYPE,
  HPA: HEB_ARCHETYPE,
  HLO: HEB_ARCHETYPE,
  CAMP: HEB_ARCHETYPE,
  RVA: HEB_ARCHETYPE,
  RES: RES_ARCHETYPE,
  ASC: ASC_ARCHETYPE,
  ACT: ASC_ARCHETYPE, // §48: ACT shares the ASC archetype (object_act facet applies to both)
  ITI: ITI_ARCHETYPE,
  FMA: FMA_ARCHETYPE, // §48: own archetype — BlockFMA edits object_fma dates/occurrences
  LOI: VIS_ARCHETYPE,
  PCU: VIS_ARCHETYPE,
  PNA: VIS_ARCHETYPE,
  PRD: VIS_ARCHETYPE, // §57: Producteur (agritourisme/dégustation) — visite + vente directe, modules génériques
  PSV: SRV_ARCHETYPE,
  VIL: SRV_ARCHETYPE,
  COM: SRV_ARCHETYPE,
  SPU: SRV_ARCHETYPE, // §53: Service public (toilettes publiques / eau potable / borne EV) — modules génériques, pas de facette
};

export function getArchetypeMeta(typeCode: string | null | undefined): ArchetypeMeta | null {
  if (!typeCode) {
    return null;
  }
  return TYPE_ARCHETYPES[typeCode.toUpperCase()] ?? null;
}

/** Resolve ribbon/meta from archetype bucket (editor sections). */
export const ARCHETYPE_META: Record<ArchetypeCode, ArchetypeMeta> = {
  HEB: HEB_ARCHETYPE,
  RES: RES_ARCHETYPE,
  ASC: ASC_ARCHETYPE,
  ITI: ITI_ARCHETYPE,
  VIS: VIS_ARCHETYPE,
  SRV: SRV_ARCHETYPE,
  FMA: FMA_ARCHETYPE,
};
