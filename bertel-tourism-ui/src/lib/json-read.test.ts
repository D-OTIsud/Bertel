import {
  isPlainRecord,
  isRecord,
  readArray,
  readCoercingString,
  readNullableString,
  readPermissiveBoolean,
  readRecord,
  readRecordArray,
  readRecordOrNull,
  readStrictString,
  readTrimmedString,
  readTrimmedStringList,
} from './json-read';

describe('JSON records and arrays', () => {
  it('preserves plain objects and null-prototype records by identity', () => {
    for (const value of [{}, { name: 'Réunion' }, Object.create(null)]) {
      expect(isRecord(value)).toBe(true);
      expect(isPlainRecord(value)).toBe(true);
      expect(readRecord(value)).toBe(value);
      expect(readRecordOrNull(value)).toBe(value);
    }
  });

  it('keeps service-reader instances distinct from plain draft snapshots', () => {
    class Snapshot { name = 'Réunion'; }
    for (const value of [new Snapshot(), new Date(), new Map(), new String('text')]) {
      expect(isRecord(value)).toBe(true);
      expect(isPlainRecord(value)).toBe(false);
      expect(readRecord(value)).toBe(value);
      expect(readRecordOrNull(value)).toBe(value);
    }
  });

  it.each([null, undefined, false, true, 0, NaN, '', 'text', [], ['text'], () => ({}), Symbol('x')])(
    'rejects non-record %p without confusing the empty and nullable fallbacks', (value) => {
      expect(isRecord(value)).toBe(false);
      expect(isPlainRecord(value)).toBe(false);
      expect(readRecord(value)).toEqual({});
      expect(readRecord(value)).not.toBe(readRecord(value));
      expect(readRecordOrNull(value)).toBeNull();
    },
  );

  it('preserves raw arrays but filters record arrays without mutating their entries', () => {
    const first = { id: 'first' };
    const second = Object.create(null);
    const instance = new Date();
    const input = [first, null, [], 'text', second, instance, 0];
    expect(readArray(input)).toBe(input);
    expect(readRecordArray(input)).toEqual([first, second, instance]);
    expect(readRecordArray(input)[0]).toBe(first);
    expect(input).toHaveLength(7);
    const sparse = new Array(3);
    sparse[2] = first;
    expect(readArray(sparse)).toBe(sparse);
    expect(readRecordArray(sparse)).toEqual([first]);
    expect(0 in sparse).toBe(false);
  });

  it.each([null, undefined, 'text', 1, { 0: {}, length: 1 }, new Set([{}])])(
    'does not treat non-array %p as a list', (value) => {
      expect(readArray(value)).toEqual([]);
      expect(readRecordArray(value)).toEqual([]);
    },
  );

  it('trims string inputs without widening the document-reader coercion rules', () => {
    expect(readTrimmedString(' \t Réunion \n')).toBe('Réunion');
    expect(readTrimmedString(' \t')).toBe('');
    expect(readTrimmedString(12)).toBe('');
    const toString = jest.fn(() => 'text');
    expect(readTrimmedString({ toString })).toBe('');
    expect(toString).not.toHaveBeenCalled();
  });
});

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

describe('workspace string and number text', () => {
  it.each([
    [0, '0'],
    [-0, '0'],
    [12.5, '12.5'],
    [NaN, 'NaN'],
    [Infinity, 'Infinity'],
    [-Infinity, '-Infinity'],
  ])('keeps numeric text for %p instead of applying the strict-reader fallback', (value, expected) => {
    expect(readCoercingString(value, 'missing')).toBe(expected);
    expect(readStrictString(value, 'missing')).toBe('missing');
  });

  it.each(['', ' \t\r\n', '  0012  ', 'Réunion\u0000🌋'])('preserves raw string content %p', (value) => {
    expect(readCoercingString(value, 'missing')).toBe(value);
  });

  it.each([
    undefined, null, false, true, BigInt(12), Symbol('text'),
    new String('text'), new Number(12), [], ['text'], { text: 'text' },
  ].map((value) => [value]))('does not extend numeric coercion to other values: %p', (value) => {
    expect(readCoercingString(value)).toBe('');
    expect(readCoercingString(value, '  missing  ')).toBe('  missing  ');
  });
});

describe('workspace permissive booleans', () => {
  it.each(['true', '1', 'yes', 'oui', ' TRUE\t', ' YeS ', '\nOUI\u00a0'])('accepts the existing affirmative token %p', (value) => {
    expect(readPermissiveBoolean(value)).toBe(true);
  });

  it.each([
    [true, true], [false, false], [1, true], [0, false], [-1, false], [2, false],
    [NaN, false], [Infinity, false],
  ])('preserves primitive boolean/number meaning for %p', (value, expected) => {
    expect(readPermissiveBoolean(value)).toBe(expected);
  });

  it.each([
    '', ' \t', 'false', '0', 'no', 'non', 'vrai', 'on', '01', '1.0',
    undefined, null, BigInt(1), Symbol('true'), new String('true'), new Number(1),
    [], ['true'], { value: true },
  ].map((value) => [value]))('keeps unrecognized tokens and non-primitives false: %p', (value) => {
    expect(readPermissiveBoolean(value)).toBe(false);
  });
});

describe('workspace trimmed string lists', () => {
  it('retains order, duplicates and numeric text while dropping empty and unsupported entries', () => {
    const input = [
      ' alpha ', '', ' \t', 0, -0, 2.5, NaN, Infinity, -Infinity,
      true, false, null, undefined, BigInt(1), Symbol('text'),
      new String('boxed'), ['nested'], { text: 'object' }, 'alpha', ' beta ',
    ];
    const snapshot = [...input];
    expect(readTrimmedStringList(input)).toEqual([
      'alpha', '0', '0', '2.5', 'NaN', 'Infinity', '-Infinity', 'alpha', 'beta',
    ]);
    expect(input).toEqual(snapshot);
  });

  it('ignores sparse holes without changing their positions in the input', () => {
    const input: unknown[] = [];
    input[2] = ' beta ';
    input[5] = 0;
    input[8] = ' beta ';
    expect(readTrimmedStringList(input)).toEqual(['beta', '0', 'beta']);
    expect(input).toHaveLength(9);
    expect(Object.prototype.hasOwnProperty.call(input, 0)).toBe(false);
    expect(input[2]).toBe(' beta ');
  });

  it.each([undefined, null, ' a ', 1, { 0: 'a', length: 1 }, new Set(['a']), new Uint8Array([1])])(
    'does not accept iterable or array-like non-arrays: %p', (value) => {
      expect(readTrimmedStringList(value)).toEqual([]);
    },
  );

  it('does not invoke conversion hooks on unsupported object entries', () => {
    const conversion = jest.fn(() => { throw new Error('Must not coerce objects'); });
    const value = { toString: conversion, valueOf: conversion, [Symbol.toPrimitive]: conversion };
    expect(readCoercingString(value, 'missing')).toBe('missing');
    expect(readPermissiveBoolean(value)).toBe(false);
    expect(readTrimmedStringList([value, ' safe '])).toEqual(['safe']);
    expect(conversion).not.toHaveBeenCalled();
  });
});
