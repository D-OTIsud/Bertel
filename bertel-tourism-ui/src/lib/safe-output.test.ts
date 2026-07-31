import { csvCell, escapeHtml, xlsxCell } from './safe-output';

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

describe('xlsxCell — cellule xlsx typée texte (§208)', () => {
  it("ne préfixe PAS d'apostrophe : le typage String de la cellule est la garde", () => {
    // Contre-intuitif vs csvCell : dans un .xlsx la cellule est typée, une chaîne
    // commençant par = n'est jamais évaluée — l'apostrophe serait VISIBLE.
    expect(xlsxCell('=1+1')).toBe('=1+1');
    expect(xlsxCell('+33 692 12 34 56')).toBe('+33 692 12 34 56');
  });
  it('normalise les fins de ligne en \\n et trim', () => {
    expect(xlsxCell('a\r\nb\rc\n')).toBe('a\nb\nc');
  });
  it('rend une chaîne vide pour null/undefined', () => {
    expect(xlsxCell(null)).toBe('');
    expect(xlsxCell(undefined)).toBe('');
  });
  it('borne à la limite Excel (32 767 caractères par cellule)', () => {
    const long = 'x'.repeat(40000);
    expect(xlsxCell(long).length).toBeLessThanOrEqual(32001);
    expect(xlsxCell(long).endsWith('…')).toBe(true);
  });
});
