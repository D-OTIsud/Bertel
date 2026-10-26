/** Calendar shortcuts only: choosing a holiday does not declare the business closed.
 * Dates: https://www.service-public.gouv.fr/particuliers/vosdroits/F2405
 */
export function reunionHolidays(year: number): { date: string; label: string }[] {
  const fixed = [
    ['01-01', 'Jour de l’an'],
    ['05-01', 'Fête du Travail'],
    ['05-08', '8 Mai 1945'],
    ['07-14', 'Fête nationale'],
    ['08-15', 'Assomption'],
    ['11-01', 'Toussaint'],
    ['11-11', 'Armistice'],
    ['12-20', 'Abolition de l’esclavage'],
    ['12-25', 'Noël'],
  ];
  // Gregorian Easter (Meeus/Jones/Butcher); the three movable holidays are
  // offsets from Easter Sunday. UTC keeps dates independent of the browser zone.
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const easter = Date.UTC(year, month - 1, day);
  const movable: [number, string][] = [
    [1, 'Lundi de Pâques'],
    [39, 'Ascension'],
    [50, 'Lundi de Pentecôte'],
  ];
  return [
    ...fixed.map(([date, label]) => ({ date: `${year}-${date}`, label })),
    ...movable.map(([offset, label]) => ({
      date: new Date(easter + offset * 86_400_000).toISOString().slice(0, 10),
      label,
    })),
  ].sort((one, other) => one.date.localeCompare(other.date));
}
