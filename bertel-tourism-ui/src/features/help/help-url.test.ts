import { buildHelpUrl, helpUrlMatches } from './help-url';

describe('buildHelpUrl', () => {
  test('empty state → /aide', () => {
    expect(buildHelpUrl({})).toBe('/aide');
    expect(buildHelpUrl({ query: '', question: '' })).toBe('/aide');
    expect(buildHelpUrl({ query: '  ', question: '  ' })).toBe('/aide');
  });

  test('query only', () => {
    expect(buildHelpUrl({ query: 'artisan' })).toBe('/aide?q=artisan');
  });

  test('question only', () => {
    expect(buildHelpUrl({ question: 'choisir-artisan' })).toBe('/aide?question=choisir-artisan');
  });

  test('both parameters, stable order, encoding', () => {
    expect(buildHelpUrl({ query: 'gîte', question: 'creer-hlo' })).toBe(
      '/aide?q=g%C3%AEte&question=creer-hlo',
    );
  });

  test('trims whitespace', () => {
    expect(buildHelpUrl({ query: '  artisan  ' })).toBe('/aide?q=artisan');
    expect(buildHelpUrl({ question: '  choisir-artisan  ' })).toBe('/aide?question=choisir-artisan');
  });

  test('encodes spaces', () => {
    expect(buildHelpUrl({ query: 'mot de passe' })).toBe('/aide?q=mot+de+passe');
  });
});

describe('helpUrlMatches', () => {
  test('matches trimmed semantic values', () => {
    const params = new URLSearchParams('q=artisan&question=choisir-artisan');
    expect(helpUrlMatches(params, { query: 'artisan', question: 'choisir-artisan' })).toBe(true);
    expect(helpUrlMatches(params, { query: '  artisan  ', question: 'choisir-artisan' })).toBe(true);
  });

  test('detects mismatch', () => {
    const params = new URLSearchParams('q=artisan');
    expect(helpUrlMatches(params, { query: 'commerce' })).toBe(false);
    expect(helpUrlMatches(params, { query: 'artisan', question: 'creer-com' })).toBe(false);
  });
});
