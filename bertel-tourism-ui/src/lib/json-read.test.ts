import { readNullableString, readStrictString } from './json-read';

describe('JSON primitive string readers', () => {
  it.each([
    ['surrounding spaces', '  Hôtel Basalte  '],
    ['only whitespace', ' \t\r\n\u00a0'],
    ['numeric-looking text', '0012'],
    ['embedded null and Unicode', 'Réunion\u0000🌋'],
  ])('preserves %s exactly, even with a custom fallback', (_, value) => {
    expect(readNullableString(value)).toBe(value);
    expect(readStrictString(value, 'pending')).toBe(value);
  });

  it('distinguishes an empty string from a missing value without applying a fallback to it', () => {
    expect(readNullableString('')).toBeNull();
    expect(readStrictString('')).toBe('');
    expect(readStrictString('', 'pending')).toBe('');
    expect(readStrictString(undefined, 'pending')).toBe('pending');
  });

  it.each([
    ['undefined', undefined],
    ['null', null],
    ['false', false],
    ['true', true],
    ['zero', 0],
    ['number', 12],
    ['NaN', NaN],
    ['Infinity', Infinity],
    ['bigint', BigInt(12)],
    ['symbol', Symbol('text')],
    ['boxed string', new String('text')],
    ['empty array', []],
    ['string array', ['text']],
    ['object', { text: 'text' }],
  ])('does not coerce %s into text', (_, value) => {
    expect(readNullableString(value)).toBeNull();
    expect(readStrictString(value)).toBe('');
    expect(readStrictString(value, 'pending')).toBe('pending');
  });

  it('leaves supplied fallback text untouched, including empty and whitespace-only fallbacks', () => {
    expect(readStrictString(null, '  inconnu  ')).toBe('  inconnu  ');
    expect(readStrictString(null, ' \t')).toBe(' \t');
    expect(readStrictString(null, '')).toBe('');
    expect(readStrictString(null, undefined)).toBe('');
  });

  it('does not invoke conversion hooks or inspect properties on non-string inputs', () => {
    const conversion = jest.fn(() => { throw new Error('Must not coerce'); });
    const value = {
      toString: conversion,
      valueOf: conversion,
      [Symbol.toPrimitive]: conversion,
      get length() { throw new Error('Must not inspect length'); },
    };
    expect(readNullableString(value)).toBeNull();
    expect(readStrictString(value, 'pending')).toBe('pending');
    expect(conversion).not.toHaveBeenCalled();
  });
});
