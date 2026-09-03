/**
 * Liaisons PURES du portail partenaire (18a, D10) — lecture et écriture d'une tranche.
 *
 * ═══════════════════════════════════════════════════════════════════════════════════
 * L'INVARIANT DE CE FICHIER : chaque updater rend la tranche COMPLÈTE de son module.
 * ═══════════════════════════════════════════════════════════════════════════════════
 *
 * Tous les writers de l'office sont « remplace tout » — `DELETE` inconditionnel puis
 * réinsertion, ou réconciliation par id (cf. §214). Une tranche reconstruite depuis ce
 * que l'écran AFFICHE efface donc, à l'approbation, tout ce que l'écran n'affichait pas :
 * le fax interne, le tarif enfant, la fermeture de Noël, les équipements PMR. Chaque
 * fonction ci-dessous part donc de la tranche courante (spread) et ne touche que la
 * ligne visée ; chaque test porte une assertion « ce qui n'est pas affiché survit » et
 * a été vérifié ROUGE en retirant le spread.
 *
 * LE PIÈGE DES HORAIRES, mesuré en production le 2026-09-02 :
 *   77 tranches ouvertes sur 301 n'ont AUCUN créneau — c'est la sentinelle
 *   `slots: [{ start: '', end: '' }]` émise par le parseur (object-workspace-parser.ts)
 *   pour un jour OUVERT SANS HORAIRES FIXES, que `buildOpeningsPayload` rend
 *   `closed:false, time_frames:[]`. Un `slots.filter(s => s.start && s.end)` posé
 *   n'importe où fermerait un quart des créneaux d'ouverture de la base, en silence,
 *   validé par un modérateur qui ne verrait rien. On ne filtre JAMAIS un créneau
 *   STOCKÉ sur son contenu ; un jour ouvert n'obtient JAMAIS `slots: []`, qui se relit
 *   FERMÉ. D'où le champ explicite `fixedHours` de `WeekHours`.
 *
 * `closedDays` est MORT EN LECTURE (les surcharges déployées de `build_opening_period_json`
 * figent `'closed_days','[]'`, 0 ligne `closed IS TRUE` en base) : l'état d'un jour se lit
 * UNIQUEMENT dans ses créneaux — bi-état « ouvert » / « fermé ». On continue de l'écrire
 * par symétrie (le payload sait l'émettre, et un modérateur lit mieux un jour explicitement
 * fermé qu'un jour absent), mais rien n'est DÉRIVÉ de lui.
 */
import {
  OPENING_WEEKDAYS,
  addClosedWeekday,
  classifyClosedDay,
  createPeriodDraft,
} from '../object-editor/sections/opening-period-edit';
import { createContactDraft, reconcileContactPrimary } from '../object-editor/sections/contacts-edit';
import { updateTranslatableField } from '../object-editor/sections/descriptions-field';
import { createPricingDraft } from '../object-editor/sections/pricing-row';
import { mergeEstablishmentAmenitySelection } from '../../services/object-workspace';
import type {
  ObjectWorkspaceActivityModule,
  ObjectWorkspaceCapacityItem,
  ObjectWorkspaceCapacityPoliciesModule,
  ObjectWorkspaceCharacteristicsModule,
  ObjectWorkspaceContactItem,
  ObjectWorkspaceContactsModule,
  ObjectWorkspaceDescriptionsModule,
  ObjectWorkspaceOpeningPeriod,
  ObjectWorkspaceOpeningSlot,
  ObjectWorkspaceOpeningWeekday,
  ObjectWorkspaceOpeningsModule,
  ObjectWorkspacePriceItem,
  ObjectWorkspacePricingModule,
  ObjectWorkspaceStayPolicyForm,
  WorkspaceReferenceOption,
} from '../../services/object-workspace-parser';

/** La langue de saisie du portail. FORCÉE : un compte à préférence anglaise écrirait
 *  ailleurs que la colonne française, et la fiche publiée resterait vide. */
const PORTAL_LANGUAGE = 'fr';

/** Au-delà de deux créneaux, un jour n'est plus saisissable sans risquer d'en jeter un. */
const MAX_EDITABLE_SLOTS_PER_DAY = 2;

export const PORTAL_DAY_READONLY_REASON =
  'Cet horaire comporte plusieurs services : l’office le gère pour vous.';

export const PORTAL_SEASONAL_HOURS_REASON =
  'Vos horaires changent selon la saison. L’office les gère pour vous.';

export const PORTAL_SEASONAL_OPENING_REASON =
  'Vos périodes d’ouverture changent selon la saison. L’office les gère pour vous.';

// ═══════════════════════════════ Présentation ═══════════════════════════════

/**
 * Accroche + présentation, en français, sur la fiche de l'objet.
 *
 * `updateTranslatableField(field, 'fr', 'fr', value)` : la langue est passée DEUX fois en
 * dur, pour que `baseValue` ET `values.fr` bougent ensemble — écrire `baseValue` seul
 * laisserait `values.fr` masquer la saisie à la lecture. Le texte n'est jamais nettoyé :
 * un texte simple EST du Markdown valide, et « nettoyer » abîmerait une saisie riche.
 */
export function setPresentation(
  descriptions: ObjectWorkspaceDescriptionsModule,
  chapo: string,
  description: string,
): ObjectWorkspaceDescriptionsModule {
  return {
    ...descriptions,
    object: {
      ...descriptions.object,
      chapo: updateTranslatableField(descriptions.object.chapo, PORTAL_LANGUAGE, PORTAL_LANGUAGE, chapo),
      description: updateTranslatableField(descriptions.object.description, PORTAL_LANGUAGE, PORTAL_LANGUAGE, description),
    },
  };
}

// ════════════════════════════════ Coordonnées ═══════════════════════════════

export type PortalContactKind = 'phone' | 'mobile' | 'email' | 'website';

/** Genres acceptés pour une case de l'écran, du plus au moins spécifique. La LECTURE et
 *  l'ÉCRITURE partagent cette résolution : sinon, modifier un numéro affiché comme
 *  « téléphone » alors qu'il est stocké en « mobile » créerait une ligne de plus et
 *  laisserait l'ancienne périmée à l'écran comme en base. */
const CONTACT_KIND_FALLBACKS: Record<PortalContactKind, string[]> = {
  phone: ['phone', 'mobile'],
  mobile: ['mobile', 'phone'],
  email: ['email'],
  website: ['website'],
};

function findContactRow(
  contacts: ObjectWorkspaceContactsModule,
  kind: PortalContactKind,
): ObjectWorkspaceContactItem | null {
  for (const code of CONTACT_KIND_FALLBACKS[kind]) {
    const row = contacts.objectItems.find(
      (item) => item.isPublic && item.kindCode.toLowerCase() === code,
    );
    if (row) return row;
  }
  return null;
}

/** La coordonnée PUBLIQUE de ce genre, ou '' — une ligne interne n'est jamais rendue. */
export function readPublicContact(contacts: ObjectWorkspaceContactsModule, kind: PortalContactKind): string {
  return findContactRow(contacts, kind)?.value ?? '';
}

/**
 * Écrit une coordonnée publique. Trois gestes, un seul par appel :
 *  - la ligne existe        → modifiée EN PLACE (`{ ...row, value }`), toutes les autres
 *                             lignes gardent leur référence ;
 *  - la ligne manque        → créée dans le genre DEMANDÉ (jamais dans un genre de repli) ;
 *  - la valeur est vidée    → la ligne est retirée (le saver supprime les ids absents).
 *
 * `webItems` (réseaux sociaux, OTA) n'est jamais touché : le portail ne les affiche pas.
 */
export function upsertPublicContact(
  contacts: ObjectWorkspaceContactsModule,
  kind: PortalContactKind,
  value: string,
): ObjectWorkspaceContactsModule {
  const trimmed = value.trim();
  const existing = findContactRow(contacts, kind);

  if (existing) {
    const objectItems = trimmed
      ? contacts.objectItems.map((item) => (item.id === existing.id ? { ...item, value: trimmed } : item))
      : contacts.objectItems.filter((item) => item.id !== existing.id);
    return { ...contacts, objectItems };
  }

  if (!trimmed) return contacts;

  const option = contacts.kindOptions.find((entry) => entry.code.toLowerCase() === kind);
  if (!option) {
    throw new Error(`Genre de coordonnée « ${kind} » absent du catalogue.`);
  }

  const draft = createContactDraft(contacts.kindOptions, contacts.objectItems.length === 0);
  const row: ObjectWorkspaceContactItem = {
    ...draft,
    id: `draft-contact-${kind}-${Date.now()}`,
    kindId: option.id,
    kindCode: option.code,
    kindLabel: option.label,
    value: trimmed,
    isPublic: true,
    isPrimary: !contacts.objectItems.some((item) => item.kindCode.toLowerCase() === option.code.toLowerCase()),
  };
  return { ...contacts, objectItems: reconcileContactPrimary([...contacts.objectItems, row], row.id) };
}

// ═════════════════════════════════ Horaires ═════════════════════════════════

export interface WeekDayHours {
  /** Le jour est ouvert (au moins un créneau stocké, sentinelle comprise). */
  open: boolean;
  /** Des heures précises sont annoncées. `false` + `open` = « ouvert, sans horaires fixes ». */
  fixedHours: boolean;
  slots: ObjectWorkspaceOpeningSlot[];
  /** Trop de services pour la saisie simplifiée : l'écran affiche sans permettre d'écrire. */
  readOnly?: boolean;
}

/** Clé = code de `OPENING_WEEKDAYS`. */
export type WeekHours = Record<string, WeekDayHours>;

const WEEKDAY_ORDER = OPENING_WEEKDAYS.map((day) => day.code);

function weekdayLabel(code: string): string {
  return (OPENING_WEEKDAYS.find((day) => day.code === code)?.label ?? code).toLowerCase();
}

function openPeriodIndexes(openings: ObjectWorkspaceOpeningsModule): number[] {
  const indexes: number[] = [];
  openings.periods.forEach((period, index) => {
    if (!period.isClosure) indexes.push(index);
  });
  return indexes;
}

function isFilledSlot(slot: ObjectWorkspaceOpeningSlot): boolean {
  return Boolean(slot.start.trim()) && Boolean(slot.end.trim());
}

function hasAnyTime(slots: readonly ObjectWorkspaceOpeningSlot[]): boolean {
  return slots.some((slot) => Boolean(slot.start.trim()) || Boolean(slot.end.trim()));
}

function sameSlots(a: readonly ObjectWorkspaceOpeningSlot[], b: readonly ObjectWorkspaceOpeningSlot[]): boolean {
  return a.length === b.length && a.every((slot, index) => slot.start === b[index].start && slot.end === b[index].end);
}

function sameRefs<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

/**
 * Les sept jours d'une semaine, lus depuis l'UNIQUE période ouverte.
 *
 * L'état d'un jour vient de ses CRÉNEAUX, jamais de `closedDays` (mort en lecture) :
 *   absent               → fermé
 *   `slots: []`          → fermé (le payload omet le jour)
 *   `[{ '', '' }]`       → OUVERT, sans horaires fixes (la sentinelle : 26 % de la base)
 *   au moins une heure   → ouvert avec horaires
 */
export function readWeekHours(openings: ObjectWorkspaceOpeningsModule): {
  hours: WeekHours;
  readOnlyReason: string | null;
} {
  const indexes = openPeriodIndexes(openings);
  const period = indexes.length > 0 ? openings.periods[indexes[0]] : null;
  const hours: WeekHours = {};

  for (const code of WEEKDAY_ORDER) {
    const weekday = period?.weekdays.find((entry) => entry.code.toLowerCase() === code);
    const slots = weekday?.slots ?? [];
    hours[code] = {
      open: slots.length > 0,
      fixedHours: hasAnyTime(slots),
      slots,
      readOnly: slots.length > MAX_EDITABLE_SLOTS_PER_DAY,
    };
  }

  return {
    hours,
    // « Mono-période / saisonnier » n'existe pas dans le modèle : ni `open_all_year`
    // (qui rend « Oui » pour un gîte à deux saisons) ni `bucket` (qui dépend de la forme
    // du JSON lu) ne le disent. Le seul signal juste est le NOMBRE de périodes ouvertes.
    readOnlyReason: indexes.length > 1 ? PORTAL_SEASONAL_HOURS_REASON : null,
  };
}

/** Les créneaux à écrire pour un jour, d'après ce que l'écran annonce. Un jour ouvert
 *  n'obtient JAMAIS `slots: []` : ce serait « fermé » à la relecture. */
function desiredSlots(entry: WeekDayHours): ObjectWorkspaceOpeningSlot[] {
  if (!entry.open) return [];
  if (!entry.fixedHours) return [{ start: '', end: '' }];
  // On ne retire ici que les créneaux À MOITIÉ saisis (l'écran affiche l'erreur avant) —
  // jamais un créneau stocké. Et si rien ne reste, le jour reste OUVERT via la sentinelle.
  const filled = entry.slots.filter(isFilledSlot);
  return filled.length > 0 ? filled : [{ start: '', end: '' }];
}

function applyWeekHours(period: ObjectWorkspaceOpeningPeriod, hours: WeekHours): ObjectWorkspaceOpeningPeriod {
  const byCode = new Map<string, ObjectWorkspaceOpeningWeekday>();
  const extras: ObjectWorkspaceOpeningWeekday[] = [];
  for (const weekday of period.weekdays) {
    const code = weekday.code.toLowerCase();
    if (WEEKDAY_ORDER.includes(code)) byCode.set(code, weekday);
    else extras.push(weekday);
  }

  let closedDays = period.closedDays;

  for (const [rawCode, entry] of Object.entries(hours)) {
    const code = rawCode.toLowerCase();
    if (!WEEKDAY_ORDER.includes(code)) continue;
    const stored = byCode.get(code);

    // Un jour à plus de deux services n'est pas saisissable ici : appliquer l'entrée de
    // l'écran jetterait les créneaux qu'il n'affiche pas. On ne touche à RIEN.
    if (stored && stored.slots.length > MAX_EDITABLE_SLOTS_PER_DAY) continue;

    const next = desiredSlots(entry);

    if (stored) {
      if (!sameSlots(stored.slots, next)) byCode.set(code, { ...stored, slots: next });
    } else if (next.length > 0) {
      byCode.set(code, { code, label: weekdayLabel(code), slots: next });
    }
    // else : jour absent ET non coché — il reste absent (une insertion vide rendrait la
    // période « modifiée » sans qu'aucun changement réel ait eu lieu).

    const isClosed = closedDays.some((day) => {
      const entryDay = classifyClosedDay(day);
      return entryDay.kind === 'weekday' && entryDay.code === code;
    });

    if (entry.open && isClosed) {
      closedDays = closedDays.filter((day) => {
        const entryDay = classifyClosedDay(day);
        return !(entryDay.kind === 'weekday' && entryDay.code === code);
      });
    } else if (!entry.open && stored && !isClosed) {
      // Symétrie : sans ce retrait/ajout, un aller-retour de case laisserait un jour à la
      // fois ouvert et fermé — et une enveloppe fantôme au premier envoi.
      closedDays = addClosedWeekday(closedDays, code);
    }
  }

  const weekdays = [
    ...WEEKDAY_ORDER.map((code) => byCode.get(code)).filter((entry): entry is ObjectWorkspaceOpeningWeekday => Boolean(entry)),
    ...extras,
  ];

  if (sameRefs(weekdays, period.weekdays) && closedDays === period.closedDays) return period;
  return { ...period, weekdays, closedDays };
}

/**
 * Écrit la semaine dans l'UNIQUE période ouverte.
 *
 *  - 0 période ouverte  → une période « toute l'année » est créée (les fermetures restent) ;
 *  - 1 période ouverte  → modifiée en place, les autres périodes gardent leur référence ;
 *  - ≥ 2                → LECTURE SEULE : c'est un calendrier saisonnier, l'office le gère.
 */
export function setWeekHours(openings: ObjectWorkspaceOpeningsModule, hours: WeekHours): ObjectWorkspaceOpeningsModule {
  const indexes = openPeriodIndexes(openings);
  if (indexes.length > 1) return openings;

  if (indexes.length === 0) {
    const created = applyWeekHours(
      {
        ...createPeriodDraft(openings.periods.length),
        label: 'Horaires habituels',
        recurrence: 'always',
        startDate: '',
        endDate: '',
        allYears: true,
      },
      hours,
    );
    return { ...openings, periods: [...openings.periods, created] };
  }

  const index = indexes[0];
  const next = applyWeekHours(openings.periods[index], hours);
  if (next === openings.periods[index]) return openings;
  return { ...openings, periods: openings.periods.map((period, i) => (i === index ? next : period)) };
}

// ══════════════ Huitième écran : ouverture d'un hébergement (D10/PO) ═════════

/**
 * Un gîte n'a pas d'heures d'ouverture — il a une SAISON et des fermetures. Le modèle
 * sous-jacent reste `openings` (mêmes périodes, même writer) ; c'est la saisie qui change.
 */
export interface StayOpening {
  /** `null` = la question n'a pas encore de réponse (aucune période enregistrée). */
  openAllYear: boolean | null;
  /** Saison d'ouverture quand `openAllYear === false` ; '' sinon. */
  startDate: string;
  endDate: string;
}

export interface StayClosure {
  /** Identité stable d'une fermeture entre la lecture et l'écriture. */
  key: string;
  startDate: string;
  endDate: string;
  label: string;
}

function closureKey(period: ObjectWorkspaceOpeningPeriod, index: number): string {
  return period.recordId ?? `i${index}`;
}

export function readStayOpening(openings: ObjectWorkspaceOpeningsModule): {
  opening: StayOpening;
  closures: StayClosure[];
  readOnlyReason: string | null;
} {
  const indexes = openPeriodIndexes(openings);
  const period = indexes.length > 0 ? openings.periods[indexes[0]] : null;

  const closures: StayClosure[] = [];
  openings.periods.forEach((entry, index) => {
    if (!entry.isClosure) return;
    closures.push({ key: closureKey(entry, index), startDate: entry.startDate, endDate: entry.endDate, label: entry.label });
  });

  return {
    opening: period
      ? {
          openAllYear: period.recurrence === 'always',
          startDate: period.recurrence === 'always' ? '' : period.startDate,
          endDate: period.recurrence === 'always' ? '' : period.endDate,
        }
      : { openAllYear: null, startDate: '', endDate: '' },
    closures,
    readOnlyReason: indexes.length > 1 ? PORTAL_SEASONAL_OPENING_REASON : null,
  };
}

/** Les sept jours ouverts sans horaires fixes — la forme normale d'un hébergement.
 *  `createPeriodDraft` rend `slots: []` pour les sept jours, ce qui se relit FERMÉ :
 *  une période « ouverte toute l'année » bâtie sur ce brouillon publierait un gîte
 *  fermé tous les jours de l'année. */
function stayWeekdays(): ObjectWorkspaceOpeningWeekday[] {
  return OPENING_WEEKDAYS.map(({ code }) => ({ code, label: weekdayLabel(code), slots: [{ start: '', end: '' }] }));
}

export function setStayOpening(
  openings: ObjectWorkspaceOpeningsModule,
  opening: StayOpening,
): ObjectWorkspaceOpeningsModule {
  const indexes = openPeriodIndexes(openings);
  if (indexes.length > 1) return openings;
  if (opening.openAllYear === null) return openings;

  const allYear = opening.openAllYear === true;
  const recurrence: ObjectWorkspaceOpeningPeriod['recurrence'] = allYear ? 'always' : 'cyclic';
  const startDate = allYear ? '' : opening.startDate;
  const endDate = allYear ? '' : opening.endDate;

  if (indexes.length === 0) {
    const created: ObjectWorkspaceOpeningPeriod = {
      ...createPeriodDraft(openings.periods.length),
      label: 'Période d’ouverture',
      isClosure: false,
      recurrence,
      startDate,
      endDate,
      allYears: true,
      weekdays: stayWeekdays(),
    };
    return { ...openings, periods: [...openings.periods, created] };
  }

  const index = indexes[0];
  const period = openings.periods[index];
  // Une période sans aucun jour ouvert se relit fermée : répondre « ouvert » doit alors
  // poser la sentinelle. Les jours DÉJÀ saisis, eux, ne sont jamais retouchés.
  const weekdays = period.weekdays.some((weekday) => weekday.slots.length > 0) ? period.weekdays : stayWeekdays();

  if (
    period.recurrence === recurrence &&
    period.startDate === startDate &&
    period.endDate === endDate &&
    weekdays === period.weekdays
  ) {
    return openings;
  }

  const next: ObjectWorkspaceOpeningPeriod = { ...period, recurrence, startDate, endDate, allYears: true, weekdays };
  return { ...openings, periods: openings.periods.map((entry, i) => (i === index ? next : entry)) };
}

/**
 * Remplace la LISTE des fermetures — et rien d'autre. Les périodes d'ouverture gardent
 * leur référence exacte, et une fermeture modifiée garde son `recordId` : sans lui, le
 * saver la supprimerait puis la recréerait, perdant tout ce que l'office y avait mis.
 */
export function setStayClosures(
  openings: ObjectWorkspaceOpeningsModule,
  closures: StayClosure[],
): ObjectWorkspaceOpeningsModule {
  const wanted = new Map(closures.map((closure) => [closure.key, closure]));
  const seen = new Set<string>();
  const periods: ObjectWorkspaceOpeningPeriod[] = [];

  openings.periods.forEach((period, index) => {
    if (!period.isClosure) {
      periods.push(period);
      return;
    }
    const key = closureKey(period, index);
    const closure = wanted.get(key);
    if (!closure) return; // fermeture retirée par le partenaire
    seen.add(key);
    if (period.startDate === closure.startDate && period.endDate === closure.endDate && period.label === closure.label) {
      periods.push(period);
      return;
    }
    periods.push({ ...period, startDate: closure.startDate, endDate: closure.endDate, label: closure.label });
  });

  for (const closure of closures) {
    if (seen.has(closure.key)) continue;
    periods.push({
      ...createPeriodDraft(periods.length),
      isClosure: true,
      recurrence: 'fixed',
      allYears: false,
      label: closure.label,
      startDate: closure.startDate,
      endDate: closure.endDate,
    });
  }

  if (sameRefs(periods, openings.periods)) return openings;
  return { ...openings, periods };
}

// ═══════════════════ Équipements et moyens de paiement ══════════════════════

/**
 * Les codes cochés à l'écran REMPLACENT ceux du catalogue visible, et seulement ceux-là :
 * `mergeEstablishmentAmenitySelection` réinjecte tout ce que l'écran ne montrait pas —
 * au premier rang les codes d'accessibilité (famille `accessibility`, jamais un code PMR
 * en dur), saisis par l'office et invisibles au partenaire.
 */
export function setAmenities(
  characteristics: ObjectWorkspaceCharacteristicsModule,
  checked: string[],
  visibleOptionCodes: Set<string>,
): ObjectWorkspaceCharacteristicsModule {
  return {
    ...characteristics,
    selectedAmenityCodes: mergeEstablishmentAmenitySelection(
      characteristics.selectedAmenityCodes,
      checked,
      visibleOptionCodes,
    ),
  };
}

/**
 * Même garde pour les moyens de paiement : le portail n'affiche que les options du
 * catalogue CHARGÉ. Un code sélectionné qui n'y figure pas (catalogue partiel, code
 * retiré du référentiel) n'est pas affiché — le remplacer à l'aveugle l'effacerait.
 */
export function setPayments(
  characteristics: ObjectWorkspaceCharacteristicsModule,
  codes: string[],
): ObjectWorkspaceCharacteristicsModule {
  const catalog = new Set(characteristics.paymentOptions.map((option) => option.code));
  return {
    ...characteristics,
    selectedPaymentCodes: mergeEstablishmentAmenitySelection(
      characteristics.selectedPaymentCodes,
      codes,
      catalog,
    ),
  };
}

// ════════════════════════ Capacité, animaux, séjour ═════════════════════════

export type PortalHeadlineMetric = 'max_capacity' | 'seats';

export function readHeadlineCapacity(
  capacity: ObjectWorkspaceCapacityPoliciesModule,
  metricCode: PortalHeadlineMetric,
): string {
  return capacity.capacityItems.find((item) => item.metricCode === metricCode)?.value ?? '';
}

/**
 * La mesure phare (capacité d'accueil / places assises). `object_capacity` est unique par
 * (objet, mesure) : la ligne existante est modifiée EN PLACE, les autres mesures — et
 * leurs fenêtres de validité — gardent leur référence.
 */
export function setHeadlineCapacity(
  capacity: ObjectWorkspaceCapacityPoliciesModule,
  metricCode: PortalHeadlineMetric,
  value: string,
): ObjectWorkspaceCapacityPoliciesModule {
  const trimmed = value.trim();
  const existing = capacity.capacityItems.find((item) => item.metricCode === metricCode);

  if (existing) {
    const capacityItems = trimmed
      ? capacity.capacityItems.map((item) => (item === existing ? { ...item, value: trimmed } : item))
      : capacity.capacityItems.filter((item) => item !== existing);
    return { ...capacity, capacityItems };
  }

  if (!trimmed) return capacity;

  const option = capacity.metricOptions.find((entry) => entry.code === metricCode);
  if (!option) {
    // La rubrique ne doit pas rendre un champ dont la mesure n'existe pas : une écriture
    // sans metric_id serait refusée à l'approbation, longtemps après la saisie.
    throw new Error(`Mesure « ${metricCode} » absente du catalogue.`);
  }

  const item: ObjectWorkspaceCapacityItem = {
    recordId: null,
    metricId: option.id,
    metricCode: option.code,
    metricLabel: option.label,
    unit: '',
    value: trimmed,
    effectiveFrom: '',
    effectiveTo: '',
  };
  return { ...capacity, capacityItems: [...capacity.capacityItems, item] };
}

/**
 * Tri-état : `null` = « je préfère ne pas répondre ». `false` n'est JAMAIS une valeur par
 * défaut — une absence de réponse publiée en « animaux non acceptés » coûterait des
 * réservations à un partenaire qui n'a rien dit.
 */
export function setPetPolicy(
  capacity: ObjectWorkspaceCapacityPoliciesModule,
  accepted: boolean | null,
  conditions: string,
): ObjectWorkspaceCapacityPoliciesModule {
  return {
    ...capacity,
    petPolicy: { accepted, conditions: accepted === true ? conditions : '' },
  };
}

export function setStayPolicy(
  capacity: ObjectWorkspaceCapacityPoliciesModule,
  patch: Partial<ObjectWorkspaceStayPolicyForm>,
): ObjectWorkspaceCapacityPoliciesModule {
  return { ...capacity, stayPolicy: { ...capacity.stayPolicy, ...patch } };
}

// ═══════════════════════════════ Tarif d'appel ══════════════════════════════

export interface StartingPriceInput {
  free: boolean;
  amount: string;
  amountMax: string;
  unitCode: string;
}

const FREE_PRICE_KIND = 'gratuit';
const DEFAULT_PRICE_KIND = 'adulte';
const MAIN_PRICE_TYPE = 'principal';

function findMainPrice(pricing: ObjectWorkspacePricingModule): ObjectWorkspacePriceItem | null {
  return (
    pricing.prices.find((price) => price.indicationCode === MAIN_PRICE_TYPE && price.kindCode === DEFAULT_PRICE_KIND) ??
    pricing.prices.find((price) => price.indicationCode === MAIN_PRICE_TYPE) ??
    null
  );
}

export function readStartingPrice(pricing: ObjectWorkspacePricingModule): StartingPriceInput {
  const main = findMainPrice(pricing);
  if (!main) return { free: false, amount: '', amountMax: '', unitCode: '' };
  return {
    free: main.kindCode === FREE_PRICE_KIND,
    amount: main.kindCode === FREE_PRICE_KIND ? '' : main.amount,
    amountMax: main.amountMax,
    unitCode: main.unitCode,
  };
}

function normalizeAmount(value: string): string {
  return value.trim().replace(',', '.');
}

function resolveOption(options: WorkspaceReferenceOption[], code: string): WorkspaceReferenceOption | null {
  return options.find((option) => option.code === code) ?? null;
}

/**
 * Le tarif d'appel — une seule ligne, celle du tarif principal. Les autres lignes
 * (enfant, options, menus), les remises et les promotions gardent leur référence : le
 * saver `save_object_commercial` remplace TOUT le bloc tarifaire d'un coup.
 */
export function setStartingPrice(
  pricing: ObjectWorkspacePricingModule,
  input: StartingPriceInput,
): ObjectWorkspacePricingModule {
  const amount = input.free ? '0' : normalizeAmount(input.amount);
  const amountMax = input.free ? '' : normalizeAmount(input.amountMax);
  const kindCode = input.free ? FREE_PRICE_KIND : DEFAULT_PRICE_KIND;
  const unit = resolveOption(pricing.priceUnitOptions, input.unitCode);
  const existing = findMainPrice(pricing);

  if (existing) {
    const kind = input.free
      ? resolveOption(pricing.priceKindOptions, FREE_PRICE_KIND)
      : existing.kindCode === FREE_PRICE_KIND
        ? resolveOption(pricing.priceKindOptions, DEFAULT_PRICE_KIND)
        : null;
    const next: ObjectWorkspacePriceItem = {
      ...existing,
      amount,
      amountMax,
      ...(kind ? { kindId: kind.id, kindCode: kind.code, kindLabel: kind.label } : {}),
      ...(unit ? { unitId: unit.id, unitCode: unit.code, unitLabel: unit.label } : {}),
    };
    return { ...pricing, prices: pricing.prices.map((price) => (price === existing ? next : price)) };
  }

  if (!input.free && !amount && !amountMax) return pricing;

  const draft = createPricingDraft(pricing);
  const kind = resolveOption(pricing.priceKindOptions, kindCode);
  const created: ObjectWorkspacePriceItem = {
    ...draft,
    ...(kind ? { kindId: kind.id, kindCode: kind.code, kindLabel: kind.label } : {}),
    ...(unit ? { unitId: unit.id, unitCode: unit.code, unitLabel: unit.label } : {}),
    indicationCode: MAIN_PRICE_TYPE,
    currency: 'EUR',
    amount,
    amountMax,
  };
  return { ...pricing, prices: [...pricing.prices, created] };
}

// ═══════════════════════════════ Activité (ASC) ═════════════════════════════

export type ActivityBasics = Partial<
  Pick<ObjectWorkspaceActivityModule, 'durationMin' | 'minParticipants' | 'maxParticipants' | 'minAge'>
>;

export function setActivityBasics(
  activity: ObjectWorkspaceActivityModule,
  patch: ActivityBasics,
): ObjectWorkspaceActivityModule {
  return { ...activity, ...patch };
}
