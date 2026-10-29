import { readString } from './object-workspace-parser';

describe('workspace exported readString adapter', () => {
  it('preserves its public name and arity', () => {
    expect(readString.name).toBe('readString');
    expect(readString).toHaveLength(1);
  });

  it('preserves raw Markdown, numeric text and the optional fallback', () => {
    const markdown = '  **Bonjour**\n\n[Réunion](https://example.com)  ';
    expect(readString(markdown, 'missing')).toBe(markdown);
    expect(readString('', 'missing')).toBe('');
    expect(readString(0, 'missing')).toBe('0');
    expect(readString(true)).toBe('');
    expect(readString(true, '  missing  ')).toBe('  missing  ');
  });
});
