import { parseInviteEmails } from './parse-invite-emails';

describe('parseInviteEmails', () => {
  it('splits on newlines, commas, semicolons and spaces', () => {
    const { valid } = parseInviteEmails('a@x.re, b@x.re;c@x.re\nd@x.re e@x.re');
    expect(valid).toEqual(['a@x.re', 'b@x.re', 'c@x.re', 'd@x.re', 'e@x.re']);
  });

  it('lowercases and trims', () => {
    expect(parseInviteEmails('  Foo.Bar@X.RE  ').valid).toEqual(['foo.bar@x.re']);
  });

  it('deduplicates (case-insensitively via normalization)', () => {
    expect(parseInviteEmails('a@x.re\nA@X.re\na@x.re').valid).toEqual(['a@x.re']);
  });

  it('separates invalid tokens', () => {
    const { valid, invalid } = parseInviteEmails('good@x.re, nope, also@bad');
    expect(valid).toEqual(['good@x.re']);
    expect(invalid).toEqual(['nope', 'also@bad']);
  });

  it('returns empty arrays for blank input', () => {
    expect(parseInviteEmails('   \n  ')).toEqual({ valid: [], invalid: [] });
  });
});
