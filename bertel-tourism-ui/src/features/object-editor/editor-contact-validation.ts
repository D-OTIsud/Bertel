const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Heuristic kind family from the ref contact_kind code (codes vary: phone/mobile/fax/email/website…). */
function classifyContactKind(kindCode: string): 'email' | 'phone' | 'url' | 'other' {
  const code = kindCode.toLowerCase();
  if (code.includes('mail')) return 'email';
  if (/(phone|tel|mobile|fax|gsm)/.test(code)) return 'phone';
  if (/(web|site|url)/.test(code)) return 'url';
  return 'other';
}

/**
 * Soft pre-save format check (warn-only): the DB only enforces the e-mail shape,
 * and only at save time — surface obvious slips before that. Empty values are the
 * presence rule's concern, not a format issue.
 */
export function isContactValueWellFormed(kindCode: string, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  switch (classifyContactKind(kindCode)) {
    case 'email':
      return EMAIL_SHAPE.test(trimmed);
    case 'phone':
      return /^[+0-9 ().\-/]+$/.test(trimmed) && (trimmed.match(/\d/g)?.length ?? 0) >= 6;
    case 'url':
      try {
        new URL(trimmed.startsWith('http') ? trimmed : `https://${trimmed}`);
        return true;
      } catch {
        return false;
      }
    default:
      return true;
  }
}
