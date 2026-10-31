/** Valeur d’un champ heure du portail : vide ou HH:MM, sans date ni secondes. */
export function isClockTime(value: unknown): value is string {
  return typeof value === 'string' && (value === '' || /^([01]\d|2[0-3]):[0-5]\d$/.test(value));
}
