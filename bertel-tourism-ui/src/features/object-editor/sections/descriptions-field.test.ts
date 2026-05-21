import { updateTranslatableField, readTranslatableField } from './descriptions-field';

describe('updateTranslatableField', () => {
  it('writes the value under the active language', () => {
    const result = updateTranslatableField({ baseValue: '', values: {} }, 'en', 'fr', 'Hello');
    expect(result.values.en).toBe('Hello');
  });

  it('updates baseValue only when writing the local language', () => {
    const local = updateTranslatableField({ baseValue: 'old', values: {} }, 'fr', 'fr', 'Bonjour');
    expect(local.baseValue).toBe('Bonjour');
    const foreign = updateTranslatableField({ baseValue: 'old', values: {} }, 'en', 'fr', 'Hello');
    expect(foreign.baseValue).toBe('old');
  });

  it('clears the entry when the value is emptied', () => {
    const result = updateTranslatableField({ baseValue: 'x', values: { en: 'Hi' } }, 'en', 'fr', '  ');
    expect(result.values.en).toBeUndefined();
  });
});

describe('readTranslatableField', () => {
  it('reads the value for a language', () => {
    expect(readTranslatableField({ baseValue: '', values: { fr: 'Salut' } }, 'fr', 'fr')).toBe('Salut');
    expect(readTranslatableField({ baseValue: '', values: {} }, 'en', 'fr')).toBe('');
  });

  it('falls back to baseValue only for the local language', () => {
    const field = { baseValue: 'Bonjour', values: {} };
    expect(readTranslatableField(field, 'fr', 'fr')).toBe('Bonjour');
    expect(readTranslatableField(field, 'en', 'fr')).toBe('');
  });
});
