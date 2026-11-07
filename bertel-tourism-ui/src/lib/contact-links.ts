// SEC-7: explicit URL schemes retain the existing http/https-only contact policy.
export function normalizeUrlValue(value: string): string {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    try {
      const protocol = new URL(normalized).protocol;
      return protocol === 'http:' || protocol === 'https:' ? normalized : '';
    } catch {
      return '';
    }
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

export function buildContactHref(kindCode: string, value: string): string {
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
