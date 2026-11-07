import { isContactValueWellFormed } from './editor-contact-validation';

describe('editor contact warning policy', () => {
  it.each([
    ['email', 'a@b.c', false],
    ['email', 'a@b.co', true],
    ['email', 'a@@b.co', false],
    ['email', ' a@b.co ', true],
    ['email', 'a b@c.co', false],
    ['phone_email', 'a@b.co', true],
    ['phone_email', '123456', false],
    ['website_phone', 'http://example.com', false],
    ['smartphone', '123/456', true],
    [' GSM ', '+262 (692) 12-34-56', true],
    ['phone', '12345', false],
    ['phone', '123456', true],
    ['phone', '12 ext 3456', false],
    ['phone', '١٢٣٤٥٦', false],
    ['booking', 'not a URL', true],
    ['unknown', 'bad', true],
  ])('retains kind-family precedence and format handling for %p / %p', (kind, value, expected) => {
    expect(isContactValueWellFormed(kind, value)).toBe(expected);
  });

  it.each([
    ['example.com', true],
    ['https://example.com', true],
    ['HTTP://example.com', true],
    ['ftp://example.com', true],
    ['httpx://example.com', true],
    ['mailto:a@b.co', true],
    ['https://', false],
    ['javascript:alert(1)', false],
  ])('keeps URL warnings distinct from the href scheme-security policy: %p', (value, expected) => {
    expect(isContactValueWellFormed('website', value)).toBe(expected);
  });

  it('leaves empty-value presence and required gates to the caller', () => {
    for (const kind of ['email', 'phone', 'website', 'unknown']) {
      expect(isContactValueWellFormed(kind, '')).toBe(true);
      expect(isContactValueWellFormed(kind, ' \t\r\n')).toBe(true);
    }
    // Classification was always skipped for empty values, even for malformed runtime kinds.
    expect(isContactValueWellFormed(null as unknown as string, '')).toBe(true);
    expect(() => isContactValueWellFormed(null as unknown as string, 'nonempty')).toThrow();
  });
});
