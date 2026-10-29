import { buildContactHref, normalizeUrlValue } from './contact-links';

describe('contact URL normalization', () => {
  it.each([
    [' https://example.com/x?y=1#z ', 'https://example.com/x?y=1#z'],
    ['HTTP://EXAMPLE.COM/X', 'HTTP://EXAMPLE.COM/X'],
    ['example.com/path', 'https://example.com/path'],
    ['https://user:pass@example.com', 'https://user:pass@example.com'],
    ['   ', ''],
    ['https://', ''],
  ])('preserves existing normalization for %p', (value, expected) => {
    expect(normalizeUrlValue(value)).toBe(expected);
  });

  it.each([
    'javascript://x%0aalert(document.cookie)',
    'javascript:alert(1)',
    'JavaScript://X',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://example.com',
    'mailto:alice@example.com',
  ])('rejects a non-HTTP explicit URL scheme: %p', (value) => {
    expect(normalizeUrlValue(value)).toBe('');
    expect(buildContactHref('website', value)).toBe('');
  });

  it.each([
    ['//example.com', 'https:////example.com'],
    ['/relative', 'https:///relative'],
    ['not a host', 'https://not a host'],
    ['java\nscript:alert(1)', 'https://java\nscript:alert(1)'],
    ['javascript&#58;alert(1)', 'https://javascript&#58;alert(1)'],
  ])('retains the existing bare-value policy without adding canonicalization: %p', (value, expected) => {
    expect(normalizeUrlValue(value)).toBe(expected);
  });
});

describe('contact kind routing and precedence', () => {
  it.each(['email', 'mail', 'e-mail', 'courriel', ' EMAIL '])('routes %p to mail without altering address text', (kind) => {
    expect(buildContactHref(kind, ' Contact@Example.COM ')).toBe('mailto:Contact@Example.COM');
  });

  it.each([
    ['phone', 'mobile', 'fax', 'tel', 'telephone', 'telephone_fixe', 'telephone_mobile'],
    ['work_phone_ext', 'home-mobile', 'fax_secondary', 'business-tel', ' TELEPHONE_MOBILE '],
  ].flat())('recognizes the existing phone kind %p', (kind) => {
    expect(buildContactHref(kind, ' +262 (262) 00-00-00 ')).toBe('tel:+262262000000');
  });

  it.each(['smartphone', 'phonebook', 'telephonefoo'])('does not infer a phone from an unknown nonempty kind %p', (kind) => {
    expect(buildContactHref(kind, '0262 00 00 00')).toBe('');
  });

  it.each([
    ['', 'alice@example.com', 'mailto:alice@example.com'],
    ['', 'https://user@example.com', 'mailto:https://user@example.com'],
    ['email', 'javascript:alert(1)', 'mailto:javascript:alert(1)'],
    ['phone', 'javascript:123456', 'tel:123456'],
    ['work_phone_ext', '12 ext 34', 'tel:1234'],
    ['phone', '00262 262 00 00 00', 'tel:00262262000000'],
    ['whatsapp', '+262 692 12 34 56', 'https://wa.me/262692123456'],
    ['whatsapp_phone', '+262 692 12 34 56', 'tel:+262692123456'],
    ['', '123456', 'tel:123456'],
    ['', '12345', ''],
    ['', '123.456', 'tel:123456'],
    ['', '12 ext 3456', ''],
    ['phone', '+', 'tel:+'],
    ['whatsapp', '+', ''],
    ['phone', 'abc', ''],
    ['booking', 'example.com', 'https://example.com'],
    ['unknown', 'https://example.com', 'https://example.com'],
    ['unknown', 'example.com', 'https://example.com'],
    ['unknown', 'alice@example.com', ''],
    ['', '   ', ''],
  ])('retains routing precedence for kind %p and value %p', (kind, value, expected) => {
    expect(buildContactHref(kind, value)).toBe(expected);
  });
});
