import type { ObjectDetail } from '../../types/domain';
import { resolveWebPlatform } from '../../lib/web-platform';

interface GenericRecord {
  [key: string]: unknown;
}

type RelatedDirection = 'in' | 'out' | 'associated';

export interface ContactItem {
  id: string;
  label: string;
  kind: string;
  kindCode: string;
  value: string;
  /** Label shown to the user: platform name for URL contacts, raw `value` otherwise. */
  displayValue: string;
  href: string;
  iconUrl: string;
  isPrimary: boolean;
  isPublic: boolean;
  position: number | null;
  source: 'object' | 'actor' | 'organization';
  sourceName: string;
  visibility: string;
}

export interface ActorItem {
  id: string;
  name: string;
  role: string;
  contacts: string[];
  visibility: string;
  isPrimary: boolean;
  note: string;
}

export interface OrganizationItem {
  id: string;
  name: string;
  linkType: string;
  contacts: string[];
  emails: string[];
  note: string;
  source: 'organization' | 'org_link' | 'parent_object';
}

export interface MediaItem {
  id: string;
  url: string;
  title: string;
  /** Editor's "texte alternatif" (media.description) — preferred alt text for <img>. */
  description: string;
  tags: string[];
  isMain: boolean;
  credit: string;
  visibility: string;
  position: string;
  width: string;
  height: string;
  typeCode: string;
  typeLabel: string;
}

export interface LegalItem {
  label: string;
  status: string;
  documentId: string;
  validityMode: string;
  daysUntilExpiry: string;
  deliveredAt: string;
  /** When false, hide from public fiche (detail drawer). Missing/unknown treated as public. */
  isPublic: boolean;
}

export interface PriceItem {
  label: string;
  amount: string;
  currency: string;
  periodLabel: string;
  details: string[];
}

export interface OpeningItem {
  label: string;
  slots: string[];
  weekdays: string[];
  weekdaySlots?: Array<{ weekday: string; slots: string[] }>;
  details: string[];
  season: string;
  allYears: boolean;
  startDate: string;
  endDate: string;
}

export function formatOpeningTime(value: unknown): string {
  const raw = readString(value).trim();
  if (!raw) {
    return '';
  }

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\.\d+)?$/);
  if (match) {
    return `${match[1].padStart(2, '0')}:${match[2]}`;
  }

  return raw;
}

function formatOpeningSlotRange(start: unknown, end: unknown): string {
  const startLabel = formatOpeningTime(start);
  const endLabel = formatOpeningTime(end);

  if (startLabel && endLabel) {
    return `${startLabel}–${endLabel}`;
  }

  return startLabel || endLabel;
}

function readOpeningPeriodDates(period: Record<string, unknown>): { startDate: string; endDate: string } {
  return {
    startDate: readString(period.date_start, readString(period.start_date)),
    endDate: readString(period.date_end, readString(period.end_date)),
  };
}

export function isOpeningPeriodAllYears(period: Record<string, unknown>): boolean {
  const { startDate, endDate } = readOpeningPeriodDates(period);
  const hasNoDates = !startDate && !endDate;
  const allYearsFlag = period.all_years ?? period.allYears;

  if (allYearsFlag === false || allYearsFlag === 'false' || allYearsFlag === 0) {
    return false;
  }

  if (allYearsFlag === true || allYearsFlag === 'true' || allYearsFlag === 1) {
    return hasNoDates;
  }

  return hasNoDates;
}

function getOpeningPeriodDateRangeLabel(period: Record<string, unknown>, allYears: boolean): string {
  if (allYears) {
    return 'Toute l\'annee';
  }

  return formatDateRange(period.date_start, period.date_end, '');
}

function getOpeningPeriodLabel(period: Record<string, unknown>, allYears: boolean): string {
  const explicitLabel = readString(period.label, readString(period.name));
  if (explicitLabel) {
    return explicitLabel;
  }

  if (allYears) {
    return 'Toute l\'annee';
  }

  return formatDateRange(period.date_start, period.date_end, 'Periode');
}

export function getOpeningYearTimelineSegment(
  opening: Pick<OpeningItem, 'allYears' | 'startDate' | 'endDate'>,
  year = new Date().getFullYear(),
): { left: number; width: number } {
  if (opening.allYears) {
    return { left: 0, width: 100 };
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year, 11, 31);
  const yearDayCount = Math.floor((yearEnd.getTime() - yearStart.getTime()) / 86_400_000) + 1;
  const periodStart = opening.startDate ? new Date(opening.startDate) : yearStart;
  const periodEnd = opening.endDate ? new Date(opening.endDate) : yearEnd;

  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime())) {
    return { left: 0, width: 100 };
  }

  const clampedStart = periodStart < yearStart ? yearStart : periodStart;
  const clampedEnd = periodEnd > yearEnd ? yearEnd : periodEnd;

  if (clampedEnd < yearStart || clampedStart > yearEnd) {
    return { left: 0, width: 0 };
  }

  const startDay = Math.floor((clampedStart.getTime() - yearStart.getTime()) / 86_400_000);
  const endDay = Math.floor((clampedEnd.getTime() - yearStart.getTime()) / 86_400_000);
  const left = (startDay / yearDayCount) * 100;
  const width = ((endDay - startDay + 1) / yearDayCount) * 100;

  return {
    left: Math.max(0, Math.min(100, left)),
    width: Math.max(2, Math.min(100 - left, width)),
  };
}

export interface RoomTypeItem {
  id: string;
  name: string;
  capacityAdults: string;
  beds: string;
  quantity: string;
  amenities: string[];
}

export interface MeetingRoomItem {
  id: string;
  name: string;
  capacityTheatre: string;
  capacityClassroom: string;
  capacityBoardroom: string;
  capacityU: string;
  areaM2: string;
  equipment: string[];
}

export interface MembershipItem {
  id: string;
  name: string;
  tier: string;
  status: string;
  invoiceStatus: string;
  visibilityImpact: string;
  expiresAt: string;
  campaign: string;
}

export interface ExternalSyncItem {
  id: string;
  source: string;
  externalId: string;
  status: string;
  lastSyncAt: string;
  note: string;
}

export interface CapacityItem {
  id: string;
  label: string;
  value: string;
}

export interface TaxonomyItem {
  id: string;
  label: string;
  meta: string;
}

export interface TaxonomyGroup {
  key: string;
  title: string;
  items: TaxonomyItem[];
}

export interface PetPolicyItem {
  accepted: boolean | null;
  label: string;
  details: string[];
}

export interface RelatedObjectItem {
  id: string;
  name: string;
  type: string;
  relationship: string;
  direction: RelatedDirection;
  note: string;
  distanceM: string;
}

export interface ItinerarySummary {
  distanceKm: string;
  durationHours: string;
  difficulty: string;
  elevationGain: string;
  isLoop: boolean | null;
  track: string;
  trackFormat: string;
  practices: string[];
  info: string[];
  sectionsCount: number;
  stagesCount: number;
  profilesCount: number;
}

function isRecord(value: unknown): value is GenericRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function readList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function readArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? (value.filter(isRecord) as Array<Record<string, unknown>>) : [];
}

export function readObjectRecord(detail: ObjectDetail | undefined, objectId: string | null): Record<string, unknown> {
  if (!detail || detail.id !== objectId) {
    return {};
  }

  return (detail.raw ?? {}) as Record<string, unknown>;
}

export function readString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return String(value);
  }
  return fallback;
}

export function readBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'oui'].includes(normalized)) return true;
    if (['false', '0', 'no', 'non'].includes(normalized)) return false;
  }
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
  }
  return null;
}

function readNamedValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return readString(value, fallback);
  }

  if (isRecord(value)) {
    return (
      readString(value.name) ||
      readString(value.label) ||
      readString(value.title) ||
      readString(value.display_name) ||
      readString(value.value_name) ||
      readString(value.scheme_name) ||
      readString(value.kind_name) ||
      readString(value.kind_label) ||
      readString(value.code) ||
      readString(value.slug) ||
      fallback
    );
  }

  return fallback;
}

function readInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    const parsed = Number.parseInt(normalized, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }

  return null;
}

function readDisplayValues(value: unknown): string[] {
  return readList(value)
    .map((item) => readNamedValue(item))
    .filter(Boolean);
}

function makeItemId(prefix: string, record: Record<string, unknown>, index: number, fallback = ''): string {
  return readString(record.id, readString(record.code, readString(record.slug, `${prefix}-${fallback || index}`)));
}

function dedupeByKey<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

const CLASSIFICATION_SCHEME_LABELS: Record<string, string> = {
  hot_stars: 'Classement hotelier',
  camp_stars: 'Classement camping',
  meuble_stars: 'Classement meubles',
  gites_epics: 'Gites de France',
  clevacances_keys: 'Clevacances',
  green_key: 'Clef Verte',
  eu_ecolabel: 'Ecolabel europeen',
  tourisme_handicap: 'Tourisme & Handicap',
  qualite_tourisme: 'Qualite Tourisme',
  qualite_tourisme_reunion: 'Qualite Tourisme Ile de La Reunion',
  lbl_qualite_tourisme: 'Qualite Tourisme',
};

function humanizeCode(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed
    .replace(/^LBL_/i, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function humanizeClassificationScheme(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return '';
  }

  return CLASSIFICATION_SCHEME_LABELS[normalized] ?? humanizeCode(value);
}

function humanizeClassificationValue(schemeCode: string, value: string): string {
  const cleanValue = value.trim();
  const normalizedScheme = schemeCode.trim().toLowerCase();
  const normalizedValue = cleanValue.toLowerCase();

  if (!cleanValue || ['granted', 'certified', 'active', 'yes', 'true', 'oui'].includes(normalizedValue)) {
    return '';
  }

  if (/^\d+([.,]\d+)?$/.test(cleanValue)) {
    if (['hot_stars', 'camp_stars', 'meuble_stars'].includes(normalizedScheme)) {
      return `${cleanValue} etoiles`;
    }
    if (normalizedScheme === 'gites_epics') {
      return `${cleanValue} epis`;
    }
    if (normalizedScheme === 'clevacances_keys') {
      return `${cleanValue} cles`;
    }
  }

  return humanizeCode(cleanValue) || cleanValue;
}

function formatClassificationLabel(scheme: string, level: string, schemeCode = ''): string {
  const rawScheme = scheme.trim();
  const cleanScheme = (
    rawScheme && !rawScheme.includes('_') ? rawScheme : humanizeClassificationScheme(schemeCode || rawScheme)
  ).trim();
  const rawLevel = level.trim();
  const cleanLevel = (humanizeClassificationValue(schemeCode, rawLevel) || rawLevel).trim();
  const normalizedSchemeCode = schemeCode.trim().toLowerCase();

  if (!cleanLevel) {
    return cleanScheme;
  }

  if (!cleanScheme) {
    return cleanLevel;
  }

  const lowerScheme = cleanScheme.toLowerCase();
  const lowerLevel = cleanLevel.toLowerCase();

  if (lowerLevel.includes(lowerScheme)) {
    return cleanLevel;
  }

  if (/^\d+([.,]\d+)?$/.test(rawLevel) && ['hot_stars', 'camp_stars', 'meuble_stars', 'gites_epics', 'clevacances_keys'].includes(normalizedSchemeCode)) {
    return `${cleanScheme} · ${humanizeClassificationValue(normalizedSchemeCode, rawLevel)}`;
  }

  if (/^\d+([.,]\d+)?$/.test(cleanLevel)) {
    return `${cleanLevel} ${lowerScheme}`;
  }

  return cleanScheme ? `${cleanScheme} · ${cleanLevel}` : cleanLevel;
}

function normalizeUrlValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (/^https?:\/\//i.test(normalized)) {
    return normalized;
  }

  if (/^[a-z]+:\/\//i.test(normalized)) {
    return normalized;
  }

  return `https://${normalized}`;
}

function normalizePhoneValue(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (trimmed.startsWith('+')) {
    return `+${trimmed.slice(1).replace(/[^\d]/g, '')}`;
  }

  return trimmed.replace(/[^\d]/g, '');
}

function isPhoneKind(kindCode: string): boolean {
  return ['phone', 'mobile', 'fax', 'tel', 'telephone', 'telephone_fixe', 'telephone_mobile'].includes(kindCode)
    || /(^|[_-])(phone|mobile|fax|tel)([_-]|$)/.test(kindCode);
}

function isLikelyPhoneValue(value: string): boolean {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length >= 6 && /^[+()\d\s.-]+$/.test(value);
}

function buildContactHref(kindCode: string, value: string): string {
  const normalizedKind = kindCode.trim().toLowerCase();
  const normalizedValue = value.trim();

  if (!normalizedValue) {
    return '';
  }

  if (['email', 'mail', 'e-mail', 'courriel'].includes(normalizedKind) || (!normalizedKind && normalizedValue.includes('@'))) {
    return `mailto:${normalizedValue}`;
  }

  if (isPhoneKind(normalizedKind) || (!normalizedKind && isLikelyPhoneValue(normalizedValue))) {
    const phone = normalizePhoneValue(normalizedValue);
    return phone ? `tel:${phone}` : '';
  }

  if (normalizedKind === 'whatsapp') {
    const phone = normalizePhoneValue(normalizedValue).replace(/^\+/, '');
    return phone ? `https://wa.me/${phone}` : '';
  }

  if (
    ['website', 'booking', 'facebook', 'instagram', 'linkedin', 'youtube', 'tiktok'].includes(normalizedKind) ||
    /^https?:\/\//i.test(normalizedValue) ||
    /^[\w.-]+\.[a-z]{2,}/i.test(normalizedValue)
  ) {
    return normalizeUrlValue(normalizedValue);
  }

  return '';
}

function extractEmails(value: unknown): string[] {
  return readArray(value)
    .map((contact) => readString(contact.value).trim().toLowerCase())
    .filter((contact) => contact.includes('@'));
}

function formatDateRange(start: unknown, end: unknown, fallback: string): string {
  const startLabel = readString(start);
  const endLabel = readString(end);

  if (startLabel && endLabel) {
    return `${startLabel} -> ${endLabel}`;
  }
  if (startLabel) {
    return `A partir du ${startLabel}`;
  }
  if (endLabel) {
    return `Jusqu'au ${endLabel}`;
  }
  return fallback;
}

function mapContactLines(value: unknown): string[] {
  return readArray(value)
    .map((item) => {
      const kind = readNamedValue(item.kind, readString(item.kind_code));
      const label = readNamedValue(item.role, kind || 'Contact');
      const rawValue = readString(item.value);
      return rawValue ? `${label}: ${rawValue}` : '';
    })
    .filter(Boolean);
}

function normalizeOrganizationEntry(organization: Record<string, unknown>, index: number, source: OrganizationItem['source']): OrganizationItem {
  return {
    id: readString(organization.id, `${source}-${index}`),
    name: readString(organization.name, 'Organisation'),
    linkType: readNamedValue(organization.role ?? organization.relation_type, readString(organization.link_type, 'Lien non precise')),
    contacts: mapContactLines(organization.contacts),
    emails: extractEmails(organization.contacts),
    note: readString(organization.note),
    source,
  };
}

function flattenPricePeriods(price: Record<string, unknown>, label: string, defaultAmount: string, defaultCurrency: string): PriceItem[] {
  const periods = readArray(price.periods ?? price.price_periods ?? price.object_price_periods);

  if (periods.length === 0) {
    return [{
      label,
      amount: defaultAmount,
      currency: defaultCurrency,
      periodLabel: readString(price.period_label, readString(price.name, 'Periode non detaillee')),
      details: [readNamedValue(price.unit), readString(price.indication_code)].filter(Boolean),
    }];
  }

  return periods.map((period, index) => ({
    label,
    amount: readString(period.amount, readString(period.price, defaultAmount)),
    currency: readString(period.currency, defaultCurrency),
    periodLabel: readString(period.label, formatDateRange(period.start_date, period.end_date, `Periode ${index + 1}`)),
    details: [
      formatDateRange(period.start_date, period.end_date, ''),
      readString(period.start_time) && readString(period.end_time) ? `${readString(period.start_time)} -> ${readString(period.end_time)}` : '',
      readString(period.discount_label),
      readString(period.conditions),
    ].filter(Boolean),
  }));
}

function flattenOpeningSchedules(period: Record<string, unknown>): OpeningItem[] {
  const schedules = readArray(period.schedules ?? period.opening_schedules ?? period.schedule_blocks);

  if (schedules.length === 0) {
    const slots = Array.isArray(period.slots) ? period.slots.map((slot) => String(slot)) : [];
    const weekdays = Array.isArray(period.weekdays) ? period.weekdays.map((day) => String(day)) : [];

    const allYears = isOpeningPeriodAllYears(period);
    const { startDate, endDate } = readOpeningPeriodDates(period);

    return [{
      label: getOpeningPeriodLabel(period, allYears),
      slots,
      weekdays,
      weekdaySlots: weekdays.map((weekday) => ({ weekday, slots })),
      details: [readString(period.status), readString(period.note)].filter(Boolean),
      season: '',
      allYears,
      startDate,
      endDate,
    }];
  }

  return schedules.map((schedule, index) => {
    const timePeriods = readArray(schedule.time_periods ?? schedule.opening_time_periods);
    const frames = timePeriods.flatMap((timePeriod) => {
      const periodFrames = readArray(timePeriod.time_frames ?? timePeriod.frames ?? timePeriod.opening_time_frames);
      return periodFrames.map((frame) => formatOpeningSlotRange(
        frame.time_start ?? frame.start_time ?? '00:00',
        frame.time_end ?? frame.end_time ?? '23:59',
      ));
    });
    const weekdays = timePeriods.flatMap((timePeriod) =>
      readArray(timePeriod.weekdays ?? timePeriod.opening_time_period_weekdays).map((weekday) => readNamedValue(weekday.weekday ?? weekday, readString(weekday.code))),
    ).filter(Boolean);
    const weekdaySlots = timePeriods.flatMap((timePeriod) => {
      const periodFrames = readArray(timePeriod.time_frames ?? timePeriod.frames ?? timePeriod.opening_time_frames)
        .map((frame) => formatOpeningSlotRange(
          frame.time_start ?? frame.start_time ?? '00:00',
          frame.time_end ?? frame.end_time ?? '23:59',
        ));
      return readArray(timePeriod.weekdays ?? timePeriod.opening_time_period_weekdays)
        .map((weekday) => readNamedValue(weekday.weekday ?? weekday, readString(weekday.code)))
        .filter(Boolean)
        .map((weekday) => ({ weekday, slots: periodFrames }));
    });

    const allYears = isOpeningPeriodAllYears(period);
    const { startDate, endDate } = readOpeningPeriodDates(period);

    return {
      label: readString(schedule.label, `${getOpeningPeriodLabel(period, allYears)} / ${readNamedValue(schedule.schedule_type, `Planning ${index + 1}`)}`),
      slots: frames,
      weekdays,
      weekdaySlots,
      details: [
        getOpeningPeriodDateRangeLabel(period, allYears),
        readNamedValue(schedule.schedule_type),
        readString(period.note),
      ].filter(Boolean),
      season: '',
      allYears,
      startDate,
      endDate,
    };
  });
}

function formatOpeningSlots(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item) => formatOpeningSlots(item));
  }

  const record = readRecord(value);
  const start = record.start ?? record.start_time ?? record.time_start;
  const end = record.end ?? record.end_time ?? record.time_end;

  if (start || end) {
    return [formatOpeningSlotRange(start ?? '00:00', end ?? '23:59')];
  }

  if (typeof value === 'string') {
    const normalized = value.trim();
    if (!normalized) {
      return [];
    }

    const parts = normalized.split(/\s*(?:->|-|–|—)\s*/).filter(Boolean);
    if (parts.length >= 2) {
      return [formatOpeningSlotRange(parts[0], parts[1])];
    }

    const formatted = formatOpeningTime(normalized);
    return formatted ? [formatted] : [];
  }

  return [];
}

function humanizeWeekday(value: string): string {
  const normalized = value.trim().toLowerCase();
  const map: Record<string, string> = {
    monday: 'Lundi',
    tuesday: 'Mardi',
    wednesday: 'Mercredi',
    thursday: 'Jeudi',
    friday: 'Vendredi',
    saturday: 'Samedi',
    sunday: 'Dimanche',
    mon: 'Lundi',
    tue: 'Mardi',
    wed: 'Mercredi',
    thu: 'Jeudi',
    fri: 'Vendredi',
    sat: 'Samedi',
    sun: 'Dimanche',
  };

  return map[normalized] ?? value;
}

function flattenCanonicalOpeningPeriod(period: Record<string, unknown>, season: string): OpeningItem {
  const rawWeekdaySlots = readRecord(period.weekday_slots);
  const weekdayEntries = Object.entries(rawWeekdaySlots).filter(([, slots]) => {
    if (Array.isArray(slots)) {
      return slots.length > 0;
    }
    if (isRecord(slots)) {
      return Object.keys(slots).length > 0;
    }
    return false;
  });
  const weekdays = weekdayEntries.map(([day]) => humanizeWeekday(day));
  const slots = weekdayEntries.flatMap(([, slotValue]) => formatOpeningSlots(slotValue));
  const weekdaySlots = weekdayEntries.map(([day, slotValue]) => ({
    weekday: humanizeWeekday(day),
    slots: formatOpeningSlots(slotValue),
  }));

  const allYears = isOpeningPeriodAllYears(period);
  const { startDate, endDate } = readOpeningPeriodDates(period);

  return {
    label: getOpeningPeriodLabel(period, allYears),
    slots,
    weekdays,
    weekdaySlots,
    details: [getOpeningPeriodDateRangeLabel(period, allYears), season].filter(Boolean),
    season,
    allYears,
    startDate,
    endDate,
  };
}

function normalizeCanonicalOpenings(value: unknown): OpeningItem[] {
  const openingTimes = readRecord(value);
  const currentPeriods = readArray(
    openingTimes.periods_current ?? openingTimes.PeriodeOuvertures ?? openingTimes.current_periods,
  );
  const nextPeriods = readArray(
    openingTimes.periods_next_year ?? openingTimes.PeriodeOuverturesAnneeSuivantes ?? openingTimes.next_year_periods,
  );

  return [
    ...currentPeriods.map((period) => flattenCanonicalOpeningPeriod(period, 'Annee en cours')),
    ...nextPeriods.map((period) => flattenCanonicalOpeningPeriod(period, 'Annee suivante')),
  ];
}

function parseNumberRank(value: string): number {
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function buildBasicTaxonomyItems(value: unknown, prefix: string): TaxonomyItem[] {
  return readList(value)
    .map((item, index) => {
      const record = readRecord(item);
      const label = readNamedValue(item);
      if (!label) {
        return null;
      }

      return {
        id: makeItemId(prefix, record, index, label),
        label,
        meta: [readString(record.status), readString(record.description)].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is TaxonomyItem => item !== null);
}

function buildClassificationItems(value: unknown): TaxonomyItem[] {
  return readArray(value)
    .map((item, index) => {
      const schemeCode = readString(item.scheme_code, readString(item.scheme, readString(readRecord(item.scheme).code)));
      const valueCode = readString(item.value_code, readString(item.value, readString(readRecord(item.value).code)));
      const rawScheme = readNamedValue(item.scheme, readString(item.scheme_name, humanizeClassificationScheme(schemeCode)));
      const rawLevel = readNamedValue(item.value, readString(item.value_name, humanizeClassificationValue(schemeCode, valueCode)));
      const scheme = rawScheme && rawScheme.trim().toLowerCase() !== schemeCode.trim().toLowerCase()
        ? rawScheme
        : humanizeClassificationScheme(schemeCode);
      const humanizedLevel = humanizeClassificationValue(schemeCode, valueCode);
      const level = rawLevel && rawLevel.trim().toLowerCase() !== valueCode.trim().toLowerCase()
        ? rawLevel
        : humanizedLevel;
      const label = formatClassificationLabel(scheme, level, schemeCode);

      if (!label) {
        return null;
      }

      return {
        id: makeItemId('classification', item, index, label),
        label,
        meta: [
          scheme && scheme !== label ? scheme : humanizeClassificationScheme(schemeCode),
          readString(item.status),
          formatDateRange(item.awarded_at, item.valid_until, ''),
        ].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is TaxonomyItem => item !== null);
}

function buildObjectTaxonomyItems(value: unknown): TaxonomyItem[] {
  const taxonomyRecord = readRecord(value);
  const domains = readArray(taxonomyRecord.domains);

  return domains
    .map((item, index) => {
      const path = readArray(readRecord(item).path)
        .map((entry) => readNamedValue(entry))
        .filter(Boolean);
      const assignedNode = readRecord(readRecord(item).assigned_node);
      const label = path.join(' > ') || readNamedValue(assignedNode);
      const domainName = readString(readRecord(item).domain_name, readString(readRecord(item).domain, 'Taxonomie'));

      if (!label) {
        return null;
      }

      return {
        id: makeItemId('taxonomy', readRecord(item), index, label),
        label,
        meta: [domainName, readString(readRecord(item).source)].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is TaxonomyItem => item !== null);
}

function buildSustainabilityItems(value: unknown): TaxonomyItem[] {
  return readArray(value)
    .map((item, index) => {
      const labelRecord = readRecord(item.label);
      const actionRecord = readRecord(item.action);
      const label = readString(labelRecord.value_name, readNamedValue(labelRecord, readNamedValue(actionRecord, 'Durabilite')));

      if (!label) {
        return null;
      }

      return {
        id: makeItemId('sustainability', item, index, label),
        label,
        meta: [
          readString(labelRecord.scheme_name),
          readNamedValue(actionRecord),
          readString(labelRecord.status),
        ].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is TaxonomyItem => item !== null);
}

function buildSustainabilityLabelItems(value: unknown): TaxonomyItem[] {
  return readArray(value)
    .map((item, index) => {
      const scheme = readString(item.scheme_name, readNamedValue(item.scheme, 'Durabilite'));
      const valueName = readString(item.value_name, readNamedValue(item.value, ''));
      const label = [scheme, valueName].filter(Boolean).join(' · ') || scheme;

      if (!label) {
        return null;
      }

      return {
        id: makeItemId('sustainability-label', item, index, label),
        label,
        meta: [readString(item.status), formatDateRange(item.awarded_at, item.valid_until, '')].filter(Boolean).join(' · '),
      };
    })
    .filter((item): item is TaxonomyItem => item !== null);
}

function createTaxonomyGroup(key: string, title: string, items: TaxonomyItem[]): TaxonomyGroup | null {
  const deduped = dedupeByKey(items, (item) => item.label.toLowerCase());
  if (!deduped.length) {
    return null;
  }

  return {
    key,
    title,
    items: deduped,
  };
}

function formatCapacityValue(record: Record<string, unknown>): string {
  const min = readString(record.min);
  const max = readString(record.max);
  const direct = readString(record.value, readString(record.amount, readString(record.count)));

  if (direct) {
    return direct;
  }
  if (min && max) {
    return `${min}-${max}`;
  }
  return min || max;
}

function parseRelationEntries(value: unknown, direction: RelatedDirection): RelatedObjectItem[] {
  return readList(value)
    .map((entry, index) => {
      const record = readRecord(entry);
      const linkedRecord =
        direction === 'in'
          ? readRecord(record.source ?? record.object ?? record.related_object)
          : readRecord(record.target ?? record.object ?? record.related_object ?? record);

      const name = readString(linkedRecord.name, readNamedValue(linkedRecord));
      if (!name) {
        return null;
      }

      return {
        id: readString(linkedRecord.id, readString(record.id, `${direction}-${index}`)),
        name,
        type: readString(linkedRecord.type, readString(record.type)),
        relationship: readNamedValue(
          record.relation_type ?? record.role ?? record.kind,
          readString(record.link_type, direction === 'associated' ? 'Associe' : direction === 'in' ? 'Entrant' : 'Sortant'),
        ),
        direction,
        note: readString(record.note),
        distanceM: readString(record.distance_m),
      };
    })
    .filter((item): item is RelatedObjectItem => item !== null);
}

export function parseContacts(raw: Record<string, unknown>): ContactItem[] {
  const objectContacts = readArray(raw.contacts);
  const parsedContacts = objectContacts.map<ContactItem | null>((contact, index) => {
    const kindRecord = readRecord(contact.kind);
    const kindCode = readString(contact.kind_code, readString(kindRecord.code)).toLowerCase();
    const kindLabel = readString(contact.kind_name, readNamedValue(contact.kind, kindCode || 'contact'));
    const value = readString(contact.value, 'Valeur a completer');
    const isPublic = readBoolean(contact.is_public) !== false;

    if (!isPublic) {
      return null;
    }

    // URL-valued contacts (website, booking platform, social…) resolve to a platform
    // identity: name + favicon. Detection is value-driven (see lib/web-platform).
    const platform = resolveWebPlatform(value);
    const existingIconUrl = readString(contact.icon_url, readString(kindRecord.icon_url));

    return {
      id: readString(contact.id, `contact-${index}`),
      label: readString(contact.label, readNamedValue(contact.role, 'Contact')),
      kind: kindLabel || 'Contact',
      kindCode,
      value,
      // Platform name for URLs, raw value otherwise. `value` stays the full URL (link/copy).
      displayValue: platform ? platform.displayName : value,
      href: buildContactHref(kindCode, value),
      // Favicon wins when a web platform is detected; else any icon from the payload.
      iconUrl: platform?.faviconUrl ?? existingIconUrl,
      isPrimary: readBoolean(contact.is_primary) === true,
      isPublic,
      position: readInteger(contact.position),
      source: 'object',
      sourceName: readString(raw.name, 'Lieu'),
      visibility: readString(contact.visibility),
    };
  });

  return parsedContacts
    .filter((item): item is ContactItem => item !== null)
    .sort((left, right) => {
      if (left.isPrimary !== right.isPrimary) {
        return Number(right.isPrimary) - Number(left.isPrimary);
      }

      const leftPosition = left.position ?? Number.MAX_SAFE_INTEGER;
      const rightPosition = right.position ?? Number.MAX_SAFE_INTEGER;
      return leftPosition - rightPosition;
    });
}

export function parseActors(raw: Record<string, unknown>): ActorItem[] {
  return readArray(raw.actors).map((actor, index) => ({
    id: readString(actor.id, `actor-${index}`),
    name: readString(actor.display_name, readString(actor.name, 'Acteur sans nom')),
    role: readNamedValue(actor.role, readString(actor.role_code, 'Role non precise')),
    contacts: mapContactLines(actor.contacts),
    visibility: readString(actor.visibility, 'public'),
    isPrimary: readBoolean(actor.is_primary) === true,
    note: readString(actor.note),
  }));
}

export function parseOrganizations(raw: Record<string, unknown>): OrganizationItem[] {
  return dedupeByKey(
    [
      ...readArray(raw.organizations).map((organization, index) => normalizeOrganizationEntry(organization, index, 'organization')),
      ...readArray(raw.org_links).map((organization, index) => normalizeOrganizationEntry(organization, index, 'org_link')),
      ...readArray(raw.parent_objects).map((organization, index) => normalizeOrganizationEntry(organization, index, 'parent_object')),
    ],
    (organization) => organization.id,
  );
}

export function parseMedia(raw: Record<string, unknown>): MediaItem[] {
  const items = readArray(raw.media).map((item, index) => ({
    id: readString(item.id, `media-${index}`),
    url: readString(item.url, readString(item.secure_url)),
    title: readString(item.title, readString(item.name, readString(item.alt_text, 'Media'))),
    description: readString(item.description, readString(item.alt_text)),
    tags: Array.isArray(item.tags)
      ? item.tags.map((tag) => readNamedValue(tag, String(tag))).filter(Boolean)
      : readArray(item.media_tags).map((tag) => readNamedValue(tag.tag ?? tag, 'tag a definir')).filter(Boolean),
    isMain: readBoolean(item.is_main ?? item.main ?? item.is_primary) === true,
    credit: readString(item.credit, readString(item.author)),
    visibility: readString(item.visibility, readNamedValue(item.status)),
    position: readString(item.position, readString(item.order)),
    width: readString(item.width),
    height: readString(item.height),
    typeCode: readString(item.type_code, readString(readRecord(item.media_type).code)),
    typeLabel: readNamedValue(item.media_type, readString(item.type_name)),
  }));

  return items.slice().sort((left, right) => {
    if (left.isMain !== right.isMain) {
      return left.isMain ? -1 : 1;
    }

    return parseNumberRank(left.position) - parseNumberRank(right.position);
  });
}

export function parseLegal(raw: Record<string, unknown>): LegalItem[] {
  return readArray(raw.legal_records).map((record) => {
    const explicit = readBoolean(record.is_public);
    return {
      label: readNamedValue(record.type, readString(record.label, 'Document legal')),
      status: readString(record.status, 'Statut inconnu'),
      documentId: readString(record.document_id, 'non fourni'),
      validityMode: readString(record.validity_mode, 'non precisee'),
      daysUntilExpiry: readString(record.days_until_expiry, 'n/a'),
      deliveredAt: readString(record.document_delivered_at, readString(record.delivered_at, readString(record.document_requested_at, 'en attente'))),
      isPublic: explicit !== false,
    };
  });
}

export function parsePrices(raw: Record<string, unknown>): PriceItem[] {
  const prices = readArray(raw.prices ?? raw.object_prices);

  return prices.flatMap((price, index) => {
    const label = readString(price.label, readNamedValue(price.kind, readString(price.name, `Tarif ${index + 1}`)));
    const defaultAmount = readString(price.amount, readString(price.base_amount, 'n/a'));
    const defaultCurrency = readString(price.currency, readString(price.currency_code, 'EUR'));
    return flattenPricePeriods(price, label, defaultAmount, defaultCurrency);
  });
}

export function parseOpenings(raw: Record<string, unknown>): OpeningItem[] {
  const canonicalOpenings = normalizeCanonicalOpenings(raw.opening_times);
  if (canonicalOpenings.length > 0) {
    return canonicalOpenings;
  }

  const openingPeriods = readArray(raw.opening_periods ?? raw.openings ?? raw.opening_times);
  return openingPeriods.flatMap((period) => flattenOpeningSchedules(period));
}

/** §72 — render the structured bed list ([{quantity, bed_type:{code,name}}]) as « 2 × Lit double, 1 × Lit simple ». */
function formatBedList(value: unknown): string {
  return readArray(value)
    .map((bed) => {
      const label = readNamedValue(bed.bed_type ?? bed, '');
      return label ? `${readString(bed.quantity, '1')} × ${label}` : '';
    })
    .filter(Boolean)
    .join(', ');
}

export function parseRoomTypes(raw: Record<string, unknown>): RoomTypeItem[] {
  // Live shape = get_object_resource's to_jsonb(object_room_type): bed_config / total_rooms.
  // §72: `beds` is now the structured array; fall back to the legacy free-text bed_config when empty.
  return readArray(raw.room_types ?? raw.object_room_types).map((room, index) => ({
    id: readString(room.id, `room-${index}`),
    name: readString(room.name, readNamedValue(room.room_type, 'Type de chambre')),
    capacityAdults: readString(room.capacity_adults, readString(room.max_capacity, 'n/a')),
    beds: formatBedList(room.beds) || readString(room.bed_config_summary, readString(room.bed_config, 'n/a')),
    quantity: readString(room.quantity, readString(room.inventory_count, readString(room.total_rooms, 'n/a'))),
    amenities: readArray(room.amenities ?? room.room_type_amenities).map((amenity) => readNamedValue(amenity.amenity ?? amenity, 'Amenite')).filter(Boolean),
  }));
}

export function parseMeetingRooms(raw: Record<string, unknown>): MeetingRoomItem[] {
  // Live shape = get_object_resource's to_jsonb(object_meeting_room): cap_* columns —
  // the old capacity_* keys matched nothing, so every capacity rendered 'n/a'.
  return readArray(raw.meeting_rooms ?? raw.object_meeting_rooms).map((room, index) => ({
    id: readString(room.id, `meeting-${index}`),
    name: readString(room.name, 'Salle MICE'),
    capacityTheatre: readString(room.capacity_theatre, readString(room.capacity_seated, readString(room.cap_theatre, 'n/a'))),
    capacityClassroom: readString(room.capacity_classroom, readString(room.cap_classroom, 'n/a')),
    capacityBoardroom: readString(room.capacity_boardroom, readString(room.cap_boardroom, 'n/a')),
    capacityU: readString(room.capacity_u, readString(room.capacity_u_shape, readString(room.cap_u, 'n/a'))),
    areaM2: readString(room.area_m2, readString(room.surface_m2, 'n/a')),
    equipment: readArray(room.equipment ?? room.meeting_room_equipment).map((item) => readNamedValue(item.equipment ?? item, 'equipement')).filter(Boolean),
  }));
}

export function parseMemberships(raw: Record<string, unknown>): MembershipItem[] {
  return readArray(raw.memberships ?? raw.object_memberships).map((membership, index) => ({
    id: readString(membership.id, `membership-${index}`),
    name: readString(membership.name, readNamedValue(membership.campaign, 'Adhesion')),
    tier: readNamedValue(membership.tier, 'Standard'),
    status: readString(membership.status, 'Statut inconnu'),
    invoiceStatus: readString(membership.invoice_status, 'Facture non renseignee'),
    visibilityImpact: readString(membership.visibility_impact, 'Impact non precise'),
    expiresAt: readString(membership.expires_at, readString(membership.ends_at, 'Echeance non renseignee')),
    campaign: readNamedValue(membership.campaign),
  }));
}

export function parseExternalSyncs(raw: Record<string, unknown>): ExternalSyncItem[] {
  return readArray(raw.external_ids ?? raw.object_external_ids).map((item, index) => ({
    id: readString(item.id, `external-${index}`),
    source: readString(item.source, readString(item.source_system, 'Source')),
    externalId: readString(item.external_id, 'non renseigne'),
    status: readString(item.status, 'Statut inconnu'),
    lastSyncAt: readString(item.last_sync_at, readString(item.updated_at, 'Jamais')),
    note: readString(item.note, readString(item.sync_note, 'Aucune note')),
  }));
}

export function parseCapacities(raw: Record<string, unknown>): CapacityItem[] {
  const structured = readList(raw.capacity).length > 0
    ? readList(raw.capacity)
    : readList(raw.capacities ?? raw.object_capacities ?? raw.capacity_metrics);

  const parsed = structured
    .map((item, index) => {
      if (typeof item === 'string' || typeof item === 'number') {
        const value = String(item);
        return value && value !== '0'
          ? {
              id: `capacity-${index}`,
              label: 'Capacite',
              value,
            }
          : null;
      }

      const record = readRecord(item);
      // Live get_object_resource emits metric_code/metric_name/unit — read those first;
      // the legacy keys (code/metric/label) made every live row render « Capacite ».
      const label = readString(
        record.metric_name,
        readNamedValue(record.code ?? record.metric ?? record.label, readString(record.label, 'Capacite')),
      );
      const rawValue = formatCapacityValue(record);
      const unit = readString(record.unit);
      const value = rawValue && unit ? `${rawValue} ${unit}` : rawValue;

      if (!rawValue || rawValue === '0') {
        return null;
      }

      return {
        id: makeItemId('capacity', record, index, label),
        label: label || 'Capacite',
        value,
        dedupeKey: readString(record.metric_code) || label.toLowerCase(),
      };
    })
    .filter((item): item is CapacityItem & { dedupeKey: string } => item !== null);

  if (parsed.length > 0) {
    // Dedupe by METRIC, never by value — two metrics with equal values are distinct.
    return dedupeByKey(parsed, (item) => item.dedupeKey).map(({ dedupeKey: _key, ...item }) => item);
  }

  const fallbackValue = readString(raw.capacity, readString(raw.total_capacity));
  return fallbackValue && fallbackValue !== '0'
    ? [{ id: 'capacity-fallback', label: 'Capacite', value: fallbackValue }]
    : [];
}

export function parseTaxonomyGroups(raw: Record<string, unknown>): TaxonomyGroup[] {
  const itineraryDetails = readRecord(raw.itinerary_details);
  const sustainabilityItems = dedupeByKey(
    [
      ...buildSustainabilityLabelItems(raw.sustainability_labels),
      ...buildSustainabilityItems(raw.sustainability_action_labels),
    ],
    (item) => item.label.toLowerCase(),
  );
  const groups = [
    createTaxonomyGroup('taxonomy', 'Taxonomie', buildObjectTaxonomyItems(raw.taxonomy)),
    createTaxonomyGroup('labels', 'Labels', buildBasicTaxonomyItems(raw.labels, 'label')),
    createTaxonomyGroup('badges', 'Badges', buildBasicTaxonomyItems(raw.badges, 'badge')),
    createTaxonomyGroup('tags', 'Tags', buildBasicTaxonomyItems(raw.tags, 'tag')),
    createTaxonomyGroup('classifications', 'Classements', buildClassificationItems(raw.classifications)),
    createTaxonomyGroup('sustainability', 'Durabilite', sustainabilityItems),
    createTaxonomyGroup('environment', 'Environnement', buildBasicTaxonomyItems(raw.environment_tags, 'environment')),
    createTaxonomyGroup('payments', 'Paiements', buildBasicTaxonomyItems(raw.payment_methods, 'payment')),
    createTaxonomyGroup('languages', 'Langues', buildBasicTaxonomyItems(raw.languages, 'language')),
    createTaxonomyGroup(
      'practices',
      'Pratiques',
      dedupeByKey(
        [...buildBasicTaxonomyItems(raw.practices ?? raw.object_practices, 'practice'), ...buildBasicTaxonomyItems(itineraryDetails.practices, 'itinerary-practice')],
        (item) => item.label.toLowerCase(),
      ),
    ),
  ];

  return groups.filter((group): group is TaxonomyGroup => group !== null);
}

export interface GroupPolicyItem {
  minSize: string;
  maxSize: string;
  groupOnly: boolean;
  notes: string;
}

/** §07 review: object_group_policy was emitted by the resource then parsed-and-dropped —
 *  the whole table was publicly write-and-forget. One row per object (PK = object_id). */
export function parseGroupPolicy(raw: Record<string, unknown>): GroupPolicyItem | null {
  const record = readRecord(readArray(raw.group_policies)[0]);
  const minSize = readString(record.min_size);
  const maxSize = readString(record.max_size);
  const groupOnly = readBoolean(record.group_only) === true;
  const notes = readString(record.notes);
  if (!minSize && !maxSize && !groupOnly && !notes) {
    return null;
  }
  return { minSize, maxSize, groupOnly, notes };
}

export function parsePetPolicy(raw: Record<string, unknown>): PetPolicyItem | null {
  const policy = readRecord(raw.pet_policy);
  const accepted = readBoolean(policy.accepted ?? policy.is_accepted ?? raw.pet_accepted ?? raw.pets_accepted);
  const label = readString(
    policy.label,
    accepted === true ? 'Animaux acceptes' : accepted === false ? 'Animaux non acceptes' : readNamedValue(policy.policy),
  );
  const details = [
    readString(policy.note),
    readString(policy.conditions),
    readString(policy.restrictions),
    readString(policy.comment),
    ...readDisplayValues(policy.allowed_types ?? policy.allowed_animals),
  ].filter(Boolean);

  if (accepted === null && !label && details.length === 0) {
    return null;
  }

  return {
    accepted,
    label: label || 'Politique animaux',
    details,
  };
}

export function parseRelatedObjects(raw: Record<string, unknown>): RelatedObjectItem[] {
  const relations = readRecord(raw.relations);
  const itineraryDetails = readRecord(raw.itinerary_details);

  return dedupeByKey(
    [
      ...parseRelationEntries(raw.associated_objects, 'associated'),
      ...parseRelationEntries(itineraryDetails.associated_objects, 'associated'),
      ...parseRelationEntries(raw.outgoing_relations, 'out'),
      ...parseRelationEntries(raw.incoming_relations, 'in'),
      ...parseRelationEntries(relations.out, 'out'),
      ...parseRelationEntries(relations.in, 'in'),
    ],
    (item) => `${item.id}-${item.relationship}-${item.direction}`,
  );
}

export function parseItinerarySummary(raw: Record<string, unknown>): ItinerarySummary | null {
  const itinerary = readRecord(raw.itinerary);
  const details = readRecord(raw.itinerary_details);
  const loopValue = readBoolean(itinerary.is_loop ?? raw.is_loop);
  const practices = dedupeByKey(
    [...buildBasicTaxonomyItems(details.practices, 'practice'), ...buildBasicTaxonomyItems(raw.practices ?? raw.object_practices, 'practice')],
    (item) => item.label.toLowerCase(),
  ).map((item) => item.label);
  const infoRecord = readRecord(details.info);
  const info = dedupeByKey(
    [
      ...readDisplayValues(details.info),
      ...['summary', 'note', 'advice', 'tips', 'recommendation', 'description'].map((key) => readString(infoRecord[key])),
    ].filter(Boolean),
    (item) => item.toLowerCase(),
  );

  const summary: ItinerarySummary = {
    distanceKm: readString(itinerary.distance_km, readString(raw.distance_km, readString(raw.length_km, readString(raw.total_length_km)))),
    // object_iti now stores duration in minutes (duration_min); convert to display hours.
    // Legacy raw.duration_h / total_duration_h (already hours) remain a fallback.
    durationHours: ((): string => {
      const minutes = Number(itinerary.duration_min ?? raw.duration_min);
      if (Number.isFinite(minutes) && minutes > 0) return String(Math.round((minutes / 60) * 100) / 100);
      return readString(raw.duration_h, readString(raw.total_duration_h));
    })(),
    difficulty: readNamedValue(itinerary.difficulty, readString(itinerary.difficulty_level, readNamedValue(raw.difficulty, readString(raw.difficulty_level)))),
    elevationGain: readString(itinerary.elevation_gain, readString(raw.elevation_gain, readString(raw.elevation_gain_m))),
    isLoop: loopValue,
    track: readString(itinerary.track, readString(raw.track, readString(details.track))),
    trackFormat: readString(itinerary.track_format, readString(raw.track_format, readString(details.track_format))),
    practices,
    info,
    sectionsCount: readList(details.sections).length,
    stagesCount: readList(details.stages).length,
    profilesCount: readList(details.profiles).length,
  };

  const hasData = [
    summary.distanceKm,
    summary.durationHours,
    summary.difficulty,
    summary.elevationGain,
    summary.track,
    summary.trackFormat,
  ].some(Boolean)
    || summary.isLoop !== null
    || summary.practices.length > 0
    || summary.info.length > 0
    || summary.sectionsCount > 0
    || summary.stagesCount > 0
    || summary.profilesCount > 0;

  return hasData ? summary : null;
}
