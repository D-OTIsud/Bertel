import { hasText } from './editor-text';

describe('editor text presence', () => {
  it.each([
    [undefined, false], [null, false], ['', false], [' \t\r\n\u00a0', false],
    ['0', true], [' false ', true], ['Réunion', true],
  ])('keeps nullish and whitespace presence semantics for %p', (value, expected) => {
    expect(hasText(value as string | null | undefined)).toBe(expected);
  });

  it.each([
    [0, true], [false, true], [NaN, true], [Infinity, true], [Symbol('text'), true],
    [[], false], [['text'], true], [{ value: 'text' }, true],
  ])('preserves String conversion for malformed runtime input %p', (value, expected) => {
    expect(hasText(value as unknown as string | null | undefined)).toBe(expected);
  });

  it('retains its one-argument name/arity and ignores the extra arguments supplied by Array.some', () => {
    expect(hasText.name).toBe('hasText');
    expect(hasText).toHaveLength(1);
    expect([undefined, null, ' \t'].some(hasText)).toBe(false);
    expect(['', 'value'].some(hasText)).toBe(true);
  });

  it('performs the original single String conversion without swallowing failures', () => {
    const convert = jest.fn(() => ' \t');
    const value = { [Symbol.toPrimitive]: convert } as unknown as string;
    expect(hasText(value)).toBe(false);
    expect(convert).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledWith('string');
    const failure = new Error('Conversion failed');
    const invalid = { toString() { throw failure; } } as unknown as string;
    expect(() => hasText(invalid)).toThrow(failure);
  });
});
