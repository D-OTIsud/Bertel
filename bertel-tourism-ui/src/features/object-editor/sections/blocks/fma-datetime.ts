/**
 * §48 — FMA occurrence datetime convention: the editor authors occurrences in
 * RÉUNION WALL-CLOCK time (fixed UTC+4 — Indian/Reunion has no DST, so plain
 * offset arithmetic is exact). Stored values are honest timestamptz instants:
 * an editor-entered 18:00 is persisted as `…T18:00:00+04:00`. Display converts
 * any stored instant (e.g. imported `…T14:00:00+00:00`) back to Réunion local.
 * Revisit if the platform ever hosts non-Réunion regions (object.business_timezone).
 */
const REUNION_OFFSET_MS = 4 * 60 * 60 * 1000;

/** Stored timestamptz ISO string → <input type="datetime-local"> value in Réunion local time. */
export function toReunionInputValue(value: string): string {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value.slice(0, 16); // unparseable legacy — show raw
  return new Date(parsed.getTime() + REUNION_OFFSET_MS).toISOString().slice(0, 16);
}

/** <input type="datetime-local"> value (Réunion local) → explicit-offset ISO for timestamptz. */
export function fromReunionInputValue(value: string): string {
  return value ? `${value}:00+04:00` : '';
}
