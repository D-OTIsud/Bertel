import type { ArchetypeCode } from '../archetypes';
import type {
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
  WorkspaceReferenceOption,
} from '../../../services/object-workspace-parser';
import { formatPriceAmount } from './pricing-row';

/**
 * Pure helpers behind the redesigned tariff-line modal (« C · Aperçu », Modales Edition).
 * Everything here maps the friendlier UI vocabulary (raccourcis, « Prix fixe / Fourchette /
 * Gratuit », « Toute l'année / Une saison / Dates précises ») onto the EXISTING object_price
 * columns — no new field is invented: amount / amount_max / season_code / valid_from / valid_to
 * keep their meaning, the modes are derived from them on open and normalised on save.
 */

export type PriceMode = 'fixed' | 'range' | 'free';
export type ValidityMode = 'year' | 'season' | 'dates';
export type AgeBracket = 'enfant' | 'junior';

const isNumeric = (value: string) => value.trim() !== '' && !Number.isNaN(Number(value));

/** price_type code for « Sur devis » lines — the only lines allowed without an amount. */
export const QUOTE_TYPE_CODE = 'devis';
/** price_kind code « Gratuit » — choosing it switches the amount to « Gratuit ». */
const FREE_KIND_CODE = 'gratuit';

export function isQuoteLine(price: Pick<ObjectWorkspacePriceItem, 'indicationCode'>): boolean {
  return price.indicationCode === QUOTE_TYPE_CODE;
}

export function isFreeAmount(price: Pick<ObjectWorkspacePriceItem, 'amount' | 'amountMax'>): boolean {
  return isNumeric(price.amount) && Number(price.amount) === 0 && !price.amountMax.trim();
}

/* ---------- Price mode (replaces the raw « Montant max. » field) ---------- */

export function derivePriceMode(price: ObjectWorkspacePriceItem): PriceMode {
  if (kindImpliesFree(price.kindCode) || isFreeAmount(price)) return 'free';
  if (price.amountMax.trim() && price.amountMax.trim() !== price.amount.trim()) return 'range';
  return 'fixed';
}

export function applyPriceMode(price: ObjectWorkspacePriceItem, mode: PriceMode): Partial<ObjectWorkspacePriceItem> {
  if (mode === 'free') return { amount: '0', amountMax: '' };
  if (mode === 'fixed') return { amount: isFreeAmount(price) ? '' : price.amount, amountMax: '' };
  return { amount: isFreeAmount(price) ? '' : price.amount };
}

/* ---------- Validity mode ---------- */

export function deriveValidityMode(price: ObjectWorkspacePriceItem): ValidityMode {
  if (price.validFrom || price.validTo) return 'dates';
  if (price.seasonCode) return 'season';
  return 'year';
}

/** Patch applied when the user switches the validity mode — keeps only the active axis. */
export function applyValidityMode(mode: ValidityMode): Partial<ObjectWorkspacePriceItem> {
  if (mode === 'year') return { seasonCode: '', validFrom: '', validTo: '' };
  if (mode === 'season') return { validFrom: '', validTo: '' };
  return { seasonCode: '' };
}

/* ---------- Age brackets: only for child / youth publics ---------- */

const CHILD_KINDS = new Set(['enfant', 'child', 'bebe']);
const YOUTH_KINDS = new Set(['jeune', 'junior', 'youth']);

export function ageBracketsFor(price: ObjectWorkspacePriceItem): AgeBracket[] {
  const brackets: AgeBracket[] = [];
  if (CHILD_KINDS.has(price.kindCode) || price.ageMinEnfant || price.ageMaxEnfant) brackets.push('enfant');
  if (YOUTH_KINDS.has(price.kindCode) || price.ageMinJunior || price.ageMaxJunior) brackets.push('junior');
  return brackets;
}

/** Drops age values of brackets that are no longer relevant (public changed from Enfant to Adulte). */
export function pruneAges(price: ObjectWorkspacePriceItem): ObjectWorkspacePriceItem {
  const keepChild = CHILD_KINDS.has(price.kindCode);
  const keepYouth = YOUTH_KINDS.has(price.kindCode);
  return {
    ...price,
    ageMinEnfant: keepChild ? price.ageMinEnfant : '',
    ageMaxEnfant: keepChild ? price.ageMaxEnfant : '',
    ageMinJunior: keepYouth ? price.ageMinJunior : '',
    ageMaxJunior: keepYouth ? price.ageMaxJunior : '',
  };
}

/* ---------- Per-archetype shortcuts (« Quel tarif ? ») ---------- */

export interface PricingPreset {
  id: string;
  label: string;
  /** Candidate price_kind codes, first match in the reference list wins. */
  kind: string[];
  type: string;
  /** Candidate price_unit codes, first match wins; empty = no unit. */
  unit: string[];
  mode?: PriceMode;
}

const ADULT = ['adulte', 'adult'];
const CHILD = ['enfant', 'child'];

const PRESETS: Record<ArchetypeCode, PricingPreset[]> = {
  HEB: [
    { id: 'nuitee', label: 'Nuitée', kind: ADULT, type: 'principal', unit: ['par_nuit', 'par_logement', 'par_chambre'] },
    { id: 'nuitee-pers', label: 'Nuitée par personne', kind: ADULT, type: 'principal', unit: ['par_personne_nuit'] },
    { id: 'semaine', label: 'Semaine', kind: ADULT, type: 'principal', unit: ['par_semaine'] },
    { id: 'petit-dej', label: 'Petit-déjeuner', kind: ADULT, type: 'option', unit: ['par_personne'] },
    { id: 'taxe', label: 'Taxe de séjour', kind: ADULT, type: 'taxe', unit: ['par_personne_nuit'] },
  ],
  RES: [
    { id: 'menu', label: 'Menu', kind: ADULT, type: 'menu', unit: ['par_personne', 'par_couvert'] },
    { id: 'menu-enfant', label: 'Menu enfant', kind: CHILD, type: 'menu', unit: ['par_personne', 'par_couvert'] },
    { id: 'groupe', label: 'Formule groupe', kind: ['groupe'], type: 'menu', unit: ['par_personne'] },
    { id: 'carte', label: 'Prix moyen à la carte', kind: ADULT, type: 'principal', unit: ['par_personne', 'par_couvert'], mode: 'range' },
  ],
  ASC: [
    { id: 'adulte', label: 'Sortie adulte', kind: ADULT, type: 'principal', unit: ['par_personne'] },
    { id: 'enfant', label: 'Sortie enfant', kind: CHILD, type: 'principal', unit: ['par_personne'] },
    { id: 'famille', label: 'Forfait famille', kind: ['famille'], type: 'pack', unit: ['par_forfait'] },
    { id: 'groupe', label: 'Groupe', kind: ['groupe'], type: 'principal', unit: ['par_groupe', 'par_personne'] },
    { id: 'materiel', label: 'Location matériel', kind: ADULT, type: 'option', unit: ['par_jour', 'par_heure'] },
  ],
  VIS: [
    { id: 'plein', label: 'Plein tarif', kind: ADULT, type: 'principal', unit: ['par_entree', 'par_personne'] },
    { id: 'enfant', label: 'Enfant', kind: CHILD, type: 'principal', unit: ['par_entree', 'par_personne'] },
    { id: 'gratuit', label: 'Gratuité', kind: ['gratuit', ...CHILD], type: 'principal', unit: ['par_entree', 'par_personne'], mode: 'free' },
    { id: 'guidee', label: 'Visite guidée', kind: ADULT, type: 'option', unit: ['par_personne'] },
    { id: 'groupe', label: 'Groupe', kind: ['groupe'], type: 'principal', unit: ['par_personne', 'par_groupe'] },
  ],
  ITI: [
    { id: 'adulte', label: 'Adulte', kind: ADULT, type: 'principal', unit: ['par_personne'] },
    { id: 'enfant', label: 'Enfant', kind: CHILD, type: 'principal', unit: ['par_personne'] },
    { id: 'groupe', label: 'Groupe', kind: ['groupe'], type: 'principal', unit: ['par_groupe'] },
    { id: 'gratuit', label: 'Accès libre', kind: ['gratuit', ...ADULT], type: 'principal', unit: [], mode: 'free' },
  ],
  SRV: [
    { id: 'prestation', label: 'Prestation', kind: ADULT, type: 'principal', unit: ['par_forfait'] },
    { id: 'heure', label: 'À l’heure', kind: ADULT, type: 'principal', unit: ['par_heure'] },
    { id: 'jour', label: 'À la journée', kind: ADULT, type: 'principal', unit: ['par_jour'] },
    { id: 'devis', label: 'Sur devis', kind: ADULT, type: QUOTE_TYPE_CODE, unit: [] },
  ],
  FMA: [
    { id: 'entree', label: 'Entrée adulte', kind: ADULT, type: 'principal', unit: ['par_entree'] },
    { id: 'enfant', label: 'Entrée enfant', kind: CHILD, type: 'principal', unit: ['par_entree'] },
    { id: 'pass', label: 'Pass', kind: ADULT, type: 'abonnement', unit: ['par_jour', 'par_sejour'] },
    { id: 'gratuit', label: 'Entrée libre', kind: ['gratuit', ...ADULT], type: 'principal', unit: [], mode: 'free' },
  ],
};

const UNIT_PRIORITY: Record<ArchetypeCode, string[]> = {
  HEB: ['par_nuit', 'par_personne_nuit', 'par_chambre', 'par_logement', 'par_semaine', 'par_sejour', 'par_personne'],
  RES: ['par_personne', 'par_couvert', 'par_groupe'],
  ASC: ['par_personne', 'par_heure', 'par_jour', 'par_seance', 'par_groupe', 'par_forfait'],
  VIS: ['par_entree', 'par_personne', 'par_groupe'],
  ITI: ['par_personne', 'par_groupe', 'par_jour'],
  SRV: ['par_forfait', 'par_heure', 'par_jour', 'par_personne'],
  FMA: ['par_entree', 'par_personne', 'par_jour'],
};

const findOption = (options: WorkspaceReferenceOption[], candidates: string[]) =>
  candidates.map((code) => options.find((option) => option.code === code)).find(Boolean) ?? null;

/** Shortcuts usable on this object: a preset is kept only if its public exists in the reference list. */
export function availablePresets(archetype: ArchetypeCode | undefined, pricing: ObjectWorkspacePricingModule): PricingPreset[] {
  if (!archetype) return [];
  return PRESETS[archetype].filter((preset) => findOption(pricing.priceKindOptions, preset.kind));
}

export function presetPatch(
  preset: PricingPreset,
  pricing: ObjectWorkspacePricingModule,
  current: ObjectWorkspacePriceItem,
): Partial<ObjectWorkspacePriceItem> {
  const kind = findOption(pricing.priceKindOptions, preset.kind);
  const unit = preset.unit.length ? findOption(pricing.priceUnitOptions, preset.unit) : null;
  const typeKnown = pricing.priceTypeOptions.some((option) => option.code === preset.type);
  const patch: Partial<ObjectWorkspacePriceItem> = {
    kindCode: kind?.code ?? current.kindCode,
    kindId: kind?.id ?? current.kindId,
    kindLabel: kind?.label ?? current.kindLabel,
    indicationCode: typeKnown ? preset.type : current.indicationCode,
    unitCode: unit?.code ?? (preset.unit.length ? current.unitCode : ''),
    unitId: unit?.id ?? (preset.unit.length ? current.unitId : ''),
    unitLabel: unit?.label ?? (preset.unit.length ? current.unitLabel : ''),
  };
  const merged = { ...current, ...patch };
  if (preset.mode) Object.assign(patch, applyPriceMode(merged, preset.mode));
  else if (isFreeAmount(current)) Object.assign(patch, applyPriceMode(merged, 'fixed'));
  return patch;
}

/** Units split into « courantes pour ce type de fiche » and the rest, both in reference order. */
export function groupUnits(archetype: ArchetypeCode | undefined, options: WorkspaceReferenceOption[]) {
  const priority = archetype ? UNIT_PRIORITY[archetype] : [];
  const common = priority
    .map((code) => options.find((option) => option.code === code))
    .filter((option): option is WorkspaceReferenceOption => Boolean(option));
  const others = options.filter((option) => !common.includes(option));
  return { common, others };
}

/** Public choosing « Gratuit » implies a free amount. */
export function kindImpliesFree(kindCode: string): boolean {
  return kindCode === FREE_KIND_CODE;
}

/* ---------- Field-level errors (shown under each field + counted in the footer) ---------- */

export interface PricingFieldErrors {
  kind?: string;
  amount?: string;
  amountMax?: string;
  season?: string;
  dates?: string;
  ageEnfant?: string;
  ageJunior?: string;
}

/** Errors that only exist because something is still missing (shown softly until the user tries to save). */
export const MISSING_KEYS: ReadonlyArray<keyof PricingFieldErrors> = ['kind', 'amount', 'season', 'dates'];

export function pricingFieldErrors(
  price: ObjectWorkspacePriceItem,
  priceMode: PriceMode,
  validityMode: ValidityMode,
): PricingFieldErrors {
  const errors: PricingFieldErrors = {};
  if (!price.kindCode.trim()) errors.kind = 'Choisissez à qui s’adresse ce tarif.';

  if (priceMode !== 'free') {
    const amount = price.amount.trim();
    if (amount && !isNumeric(amount)) errors.amount = 'Le montant doit être un nombre.';
    else if (amount && Number(amount) < 0) errors.amount = 'Le montant ne peut pas être négatif.';
    else if (!amount && !isQuoteLine(price)) errors.amount = priceMode === 'range' ? 'Indiquez le prix le plus bas.' : 'Indiquez un montant.';
  }
  if (priceMode === 'range') {
    const max = price.amountMax.trim();
    if (!max) errors.amountMax = 'Indiquez le prix le plus haut.';
    else if (!isNumeric(max)) errors.amountMax = 'Le montant doit être un nombre.';
    else if (isNumeric(price.amount) && Number(max) <= Number(price.amount)) errors.amountMax = 'Doit être supérieur au prix le plus bas.';
  }

  if (validityMode === 'season' && !price.seasonCode) errors.season = 'Choisissez une saison.';
  if (validityMode === 'dates') {
    if (!price.validFrom && !price.validTo) errors.dates = 'Indiquez au moins une date.';
    else if (price.validFrom && price.validTo && price.validTo < price.validFrom) errors.dates = 'La date de fin est avant la date de début.';
  }

  const ageError = (min: string, max: string): string | undefined => {
    if ((min && !isNumeric(min)) || (max && !isNumeric(max))) return 'Les âges doivent être des nombres.';
    if (min && max && Number(max) < Number(min)) return 'L’âge maximum est inférieur au minimum.';
    return undefined;
  };
  const brackets = ageBracketsFor(price);
  if (brackets.includes('enfant')) {
    const error = ageError(price.ageMinEnfant, price.ageMaxEnfant);
    if (error) errors.ageEnfant = error;
  }
  if (brackets.includes('junior')) {
    const error = ageError(price.ageMinJunior, price.ageMaxJunior);
    if (error) errors.ageJunior = error;
  }
  return errors;
}

/* ---------- Preview rows (« Grille tarifaire sur la fiche ») ---------- */

const labelByCode = (options: WorkspaceReferenceOption[], code: string): string =>
  code ? options.find((option) => option.code === code)?.label ?? code : '';

const frDate = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

export interface PricePreviewRow {
  title: string;
  detail: string;
  amount: string;
}

export function describePriceLine(price: ObjectWorkspacePriceItem, pricing: ObjectWorkspacePricingModule): PricePreviewRow {
  const kind = price.kindLabel || labelByCode(pricing.priceKindOptions, price.kindCode) || 'Public à choisir';
  const type = price.indicationCode && price.indicationCode !== 'principal' ? labelByCode(pricing.priceTypeOptions, price.indicationCode) : '';
  const unit = price.unitLabel || labelByCode(pricing.priceUnitOptions, price.unitCode);
  const bits: string[] = [];
  if (unit) bits.push(unit.toLowerCase());
  if (price.seasonCode) bits.push(labelByCode(pricing.priceSeasonOptions, price.seasonCode).toLowerCase());
  if (price.validFrom || price.validTo) bits.push(`${price.validFrom ? frDate(price.validFrom) : '…'} → ${price.validTo ? frDate(price.validTo) : '…'}`);
  if (price.ageMinEnfant || price.ageMaxEnfant) bits.push(`${price.ageMinEnfant || '?'}–${price.ageMaxEnfant || '?'} ans`);
  if (price.ageMinJunior || price.ageMaxJunior) bits.push(`${price.ageMinJunior || '?'}–${price.ageMaxJunior || '?'} ans`);

  let amount = formatPriceAmount(price);
  if (kindImpliesFree(price.kindCode) || isFreeAmount(price)) amount = 'Gratuit';
  else if (!amount && isQuoteLine(price)) amount = 'Sur devis';
  else if (!amount) amount = '— €';

  return { title: type ? `${kind} · ${type}` : kind, detail: bits.join(' · '), amount };
}

/** Normalises the draft on save: clears fields the active modes made irrelevant. */
export function finalizePricingDraft(
  price: ObjectWorkspacePriceItem,
  priceMode: PriceMode,
  validityMode: ValidityMode,
): ObjectWorkspacePriceItem {
  const next = { ...price, ...applyValidityMode(validityMode) };
  if (priceMode === 'free') return { ...next, amount: '0', amountMax: '' };
  if (priceMode === 'fixed') return { ...next, amountMax: '' };
  return next;
}
