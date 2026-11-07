export interface NoteAuthorFields {
  createdByName: string;
  createdByEmail?: string;
}

function isEmailValue(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Resolved email for tooltips and exports (explicit field or name fallback). */
export function getNoteAuthorEmail(fields: NoteAuthorFields): string {
  const explicit = fields.createdByEmail?.trim();
  if (explicit) {
    return explicit;
  }

  const name = fields.createdByName.trim();
  return isEmailValue(name) ? name : '';
}

/** Human-readable full name when display_name is not an email. */
export function getNoteAuthorFullName(fields: NoteAuthorFields): string {
  const name = fields.createdByName.trim();
  if (!name || isEmailValue(name)) {
    return '';
  }
  return name;
}

/** Compact byline: given name + surname initial (e.g. Marie D.), or username from email. */
export function getNoteAuthorShortLabel(fields: NoteAuthorFields): string {
  const fullName = getNoteAuthorFullName(fields);
  if (fullName) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      return parts[0];
    }
    const first = parts[0];
    const lastInitial = parts[parts.length - 1]?.[0]?.toUpperCase();
    return lastInitial ? `${first} ${lastInitial}.` : first;
  }

  const email = getNoteAuthorEmail(fields);
  if (email) {
    const localPart = email.split('@')[0] ?? email;
    const segments = localPart.split(/[._-]+/).filter(Boolean);
    if (segments.length >= 2) {
      const first = segments[0];
      const lastInitial = segments[segments.length - 1]?.[0]?.toUpperCase();
      return lastInitial ? `${first} ${lastInitial}.` : first;
    }
    return localPart;
  }

  return 'Equipe';
}

/** Label used where only one author string is needed (CSV, dialog fallback). */
export function getNoteAuthorDisplayName(fields: NoteAuthorFields): string {
  return getNoteAuthorFullName(fields) || getNoteAuthorShortLabel(fields);
}
