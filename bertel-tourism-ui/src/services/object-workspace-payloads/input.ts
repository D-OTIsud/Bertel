import { readRecord, readCoercingString as readString } from '../../lib/json-read';

export function toNullableText(value: string): string | null {
  const normalized = value.trim();
  return normalized ? normalized : null;
}



export function toNullableNumber(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseFloat(normalized.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}



export function toNullableInteger(value: string): number | null {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}



export function toRpcUuid(value: string | null | undefined): string | null {
  return value && isUuid(value) ? value : null;
}



export function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}



export const OPENING_WEEKDAY_ALIASES: Record<string, string> = {
  lundi: 'monday',
  lun: 'monday',
  monday: 'monday',
  mon: 'monday',
  mardi: 'tuesday',
  mar: 'tuesday',
  tuesday: 'tuesday',
  tue: 'tuesday',
  mercredi: 'wednesday',
  mer: 'wednesday',
  wednesday: 'wednesday',
  wed: 'wednesday',
  jeudi: 'thursday',
  jeu: 'thursday',
  thursday: 'thursday',
  thu: 'thursday',
  vendredi: 'friday',
  ven: 'friday',
  friday: 'friday',
  fri: 'friday',
  samedi: 'saturday',
  sam: 'saturday',
  saturday: 'saturday',
  sat: 'saturday',
  dimanche: 'sunday',
  dim: 'sunday',
  sunday: 'sunday',
  sun: 'sunday',
};



export function normalizeOpeningWeekdayCode(value: string): string {
  const normalized = value.trim().toLowerCase();
  return OPENING_WEEKDAY_ALIASES[normalized] ?? normalized;
}



export function buildCodeIdMap(rows: unknown[]): Map<string, string> {
  return new Map(
    rows.map((entry) => {
      const row = readRecord(entry);
      return [readString(row.code).toLowerCase(), readString(row.id)] as const;
    }).filter(([code, id]) => Boolean(code && id)),
  );
}



export function ensureKnownCodes(codes: string[], idByCode: Map<string, string>, label: string): void {
  const unknown = codes.find((code) => code && !idByCode.has(code.toLowerCase()));
  if (unknown) {
    throw new Error(`${label} inconnu: ${unknown}.`);
  }
}



export function workspaceNameForSave(name: string, rawName: string | null | undefined): string | null {
  const normalized = toNullableText(name);
  if (rawName === null && name.trim() === '') return null;
  const normalizedRawName = rawName == null ? null : toNullableText(rawName);
  if (rawName !== undefined && normalized === normalizedRawName) return rawName;
  return normalized;
}
