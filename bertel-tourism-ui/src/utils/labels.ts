/**
 * Résolveurs de libellés FR — source unique pour ne plus jamais afficher de code
 * brut comme libellé (audit S2) et pour partager UNE taxonomie type→archétype
 * entre l'Explorer, l'éditeur et le drawer (audit §2a).
 *
 * La table canonique type→archétype vit dans `features/object-editor/archetypes.ts`
 * (décisions §46/§48). Ce module en dérive : les libellés, l'accent de couleur par
 * type, et les familles de bucket de l'Explorer (qui ne peuvent donc plus diverger).
 */
import {
  ARCHETYPE_META,
  TYPE_ARCHETYPES,
  TYPE_LABEL,
  getArchetypeMeta,
  type ArchetypeCode,
} from '../features/object-editor/archetypes';
import type { BackendObjectTypeCode, ObjectTypeCode } from '../types/domain';

/** Transforme un code (SNAKE_CASE / kebab-case) en libellé lisible « Title case ». */
export function humanizeCode(code: string | null | undefined): string {
  const raw = String(code ?? '').trim();
  if (!raw) {
    return '';
  }
  const words = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Code de type DB (HOT, RES…) → libellé FR. Humanise les codes inconnus. */
export function resolveTypeLabel(code: string | null | undefined): string {
  const upper = String(code ?? '').trim().toUpperCase();
  if (!upper) {
    return '';
  }
  return TYPE_LABEL[upper] ?? humanizeCode(upper);
}

/** Code de type DB → archétype canonique (HEB/RES/ASC/ITI/VIS/SRV/FMA) ou null. */
export function resolveArchetype(code: string | null | undefined): ArchetypeCode | null {
  return getArchetypeMeta(code)?.archetype ?? null;
}

/** Libellé FR de l'archétype d'un type (« Hébergement », « Site & visite »…). */
export function resolveArchetypeLabel(code: string | null | undefined): string {
  return getArchetypeMeta(code)?.codeName ?? resolveTypeLabel(code);
}

/**
 * Classe accent de la pastille de type : `acc-<archétype>` (acc-heb…acc-fma).
 * Couleur identique sur les 3 surfaces (cartes Explorer, carte géo, fiches),
 * adossée aux tokens `--acc-*` de la Phase 1. Chaîne vide si pas d'archétype (ORG).
 */
export function resolveArchetypeAccentClass(code: string | null | undefined): string {
  const archetype = resolveArchetype(code);
  return archetype ? `acc-${archetype.toLowerCase()}` : '';
}

/**
 * Schémas de classification/label connus → libellé FR. Clés en MAJUSCULES
 * (resolveSchemeLabel normalise en upper). Couvre les codes V5 `LBL_*` ET les
 * codes de classement/label historiques qui arrivent encore des filtres live
 * (ref_classification_scheme.code). Source à consolider avec
 * `object-drawer/utils.ts CLASSIFICATION_SCHEME_LABELS` en Phase 4.
 */
const SCHEME_LABELS: Record<string, string> = {
  LBL_CLEF_VERTE: 'Clef Verte',
  LBL_ECO_LABEL_UE: 'Écolabel UE',
  LBL_TOURISME_HANDICAP: 'Tourisme & Handicap',
  LBL_DESTINATION_EXCELLENCE: 'Destination Excellence',
  LBL_QUALITE_TOURISME: 'Qualité Tourisme',
  HOT_STARS: 'Classement hôtelier',
  CAMP_STARS: 'Classement camping',
  MEUBLE_STARS: 'Classement meublés',
  GITES_EPICS: 'Gîtes de France (épis)',
  CLEVACANCES_KEYS: 'Clévacances (clés)',
  GREEN_KEY: 'Clef Verte',
  TOURISME_HANDICAP: 'Tourisme & Handicap',
  QUALITE_TOURISME: 'Qualité Tourisme',
  QUALITE_TOURISME_REUNION: 'Qualité Tourisme Île de La Réunion',
};

/** Code de schéma de distinction → libellé FR. Humanise les schémas inconnus. */
export function resolveSchemeLabel(code: string | null | undefined): string {
  const upper = String(code ?? '').trim().toUpperCase();
  if (!upper) {
    return '';
  }
  return SCHEME_LABELS[upper] ?? humanizeCode(upper);
}

/**
 * Code de rôle → libellé FR. Les rôles vivent dans `ref_org_*_role` (dynamiques) :
 * passer le catalogue résolu (code→nom) quand il est chargé ; sinon on humanise
 * le code pour ne jamais afficher de SNAKE_CASE brut.
 */
export function resolveRoleLabel(
  code: string | null | undefined,
  catalog?: Record<string, string>,
): string {
  const raw = String(code ?? '').trim();
  if (!raw) {
    return '';
  }
  return catalog?.[raw] ?? humanizeCode(raw);
}

/** Mapping archétype → code de bucket Explorer (les buckets gardent leurs codes historiques). */
const BUCKET_FOR_ARCHETYPE: Record<ArchetypeCode, ObjectTypeCode> = {
  HEB: 'HOT',
  RES: 'RES',
  ASC: 'ACT',
  ITI: 'ITI',
  FMA: 'EVT',
  VIS: 'VIS',
  SRV: 'SRV',
};

/**
 * Construit les familles de bucket de l'Explorer EN LES DÉRIVANT de la table
 * canonique type→archétype : le bucket d'un type == son archétype éditeur, par
 * construction (fin du désaccord §2a — LOI sous Visites, ASC sous Activités,
 * VIL sous Services). Source unique : impossible de re-diverger.
 */
export function buildExplorerTypeFamilies(): Record<ObjectTypeCode, BackendObjectTypeCode[]> {
  // Ordre des buckets conservé pour la stabilité de l'UI (options de filtre).
  const families: Record<ObjectTypeCode, BackendObjectTypeCode[]> = {
    HOT: [],
    RES: [],
    ACT: [],
    ITI: [],
    EVT: [],
    VIS: [],
    SRV: [],
  };
  for (const [type, meta] of Object.entries(TYPE_ARCHETYPES)) {
    const bucket = BUCKET_FOR_ARCHETYPE[meta.archetype];
    families[bucket].push(type as BackendObjectTypeCode);
  }
  return families;
}

/** Libellé FR de l'archétype (depuis ARCHETYPE_META) — utilitaire de complétude. */
export function archetypeLabel(archetype: ArchetypeCode): string {
  return ARCHETYPE_META[archetype]?.codeName ?? archetype;
}
