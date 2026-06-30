import { escapeHtml, csvCell } from './safe-output';

describe('escapeHtml (SEC-1)', () => {
  it('neutralizes a script/img XSS payload from DB content', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
  });

  it('escapes ampersands, angle brackets and both quote types', () => {
    expect(escapeHtml(`A & B <c> "d" 'e'`)).toBe('A &amp; B &lt;c&gt; &quot;d&quot; &#39;e&#39;');
  });

  it('renders null/undefined as empty string', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
  });
});

describe('csvCell (SEC-2 formula injection)', () => {
  it('prefixes every formula leader so a spreadsheet treats the cell as text', () => {
    expect(csvCell('=HYPERLINK("http://evil","x")')).toBe(
      `"'=HYPERLINK(""http://evil"",""x"")"`,
    );
    expect(csvCell('+cmd|calc')).toBe(`"'+cmd|calc"`);
    expect(csvCell('-2+3')).toBe(`"'-2+3"`);
    expect(csvCell('@SUM(A1)')).toBe(`"'@SUM(A1)"`);
  });

  it('leaves a normal value un-prefixed but RFC-quoted', () => {
    expect(csvCell('Gîte du Volcan')).toBe('"Gîte du Volcan"');
  });

  it('flattens newlines and escapes embedded quotes', () => {
    expect(csvCell('a "b"\nc')).toBe('"a ""b"" c"');
  });

  it('renders null/undefined as an empty quoted cell', () => {
    expect(csvCell(null)).toBe('""');
  });
});
