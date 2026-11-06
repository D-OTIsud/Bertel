import { z } from 'zod';

// Keep the validation wording already shown by Bertel while using the patched
// Zod 4 parsers. Schema-specific messages (including French copy) take priority.
function receivedType(input: unknown): string {
  if (input === null) return 'null';
  if (Array.isArray(input)) return 'array';
  if (input instanceof Date) return 'date';
  if (input instanceof Map) return 'map';
  if (input instanceof Set) return 'set';
  if (typeof input === 'number' && Number.isNaN(input)) return 'nan';
  return typeof input;
}

z.config({
  // Production CSP forbids unsafe-eval; skip even Zod's caught Function probe.
  jitless: true,
  customError: (issue) => {
    switch (issue.code) {
      case 'invalid_type': {
        if (issue.input === undefined) return 'Required';
        if (issue.expected === 'number' && typeof issue.input === 'number'
          && !Number.isNaN(issue.input) && !Number.isFinite(issue.input)) return 'Number must be finite';
        const expected = issue.expected === 'int' ? 'integer'
          : issue.expected === 'record' ? 'object' : issue.expected;
        const received = issue.expected === 'int' && typeof issue.input === 'number'
          ? 'float' : receivedType(issue.input);
        return `Expected ${expected}, received ${received}`;
      }
      case 'invalid_value': {
        if (issue.values.length === 1) {
          return `Invalid literal value, expected ${JSON.stringify(typeof issue.values[0] === 'bigint' ? String(issue.values[0]) : issue.values[0])}`;
        }
        if (issue.input === undefined) return 'Required';
        const options = issue.values.map((value) => `'${String(value)}'`).join(' | ');
        return typeof issue.input === 'string'
          ? `Invalid enum value. Expected ${options}, received '${issue.input}'`
          : `Expected ${options}, received ${receivedType(issue.input)}`;
      }
      case 'too_small': {
        if (issue.origin === 'string') return `String must contain ${issue.inclusive === false ? 'over' : 'at least'} ${issue.minimum} character(s)`;
        if (issue.origin === 'array') return `Array must contain ${issue.inclusive === false ? 'more than' : 'at least'} ${issue.minimum} element(s)`;
        if (issue.origin === 'number') return `Number must be ${issue.inclusive === false ? 'greater than' : 'greater than or equal to'} ${issue.minimum}`;
        return undefined;
      }
      case 'too_big': {
        if (issue.origin === 'string') return `String must contain ${issue.inclusive === false ? 'under' : 'at most'} ${issue.maximum} character(s)`;
        if (issue.origin === 'array') return `Array must contain ${issue.inclusive === false ? 'less than' : 'at most'} ${issue.maximum} element(s)`;
        if (issue.origin === 'number') return `Number must be ${issue.inclusive === false ? 'less than' : 'less than or equal to'} ${issue.maximum}`;
        return undefined;
      }
      case 'invalid_format':
        return issue.format === 'regex' ? 'Invalid' : `Invalid ${issue.format}`;
      case 'unrecognized_keys':
        return `Unrecognized key(s) in object: ${issue.keys.map((key) => `'${key}'`).join(', ')}`;
      case 'invalid_key':
        return issue.issues[0]?.message;
      case 'invalid_union':
      case 'custom':
        return 'Invalid input';
      default:
        return undefined;
    }
  },
});

// Zod 4 rejects non-finite numbers before integer refinements run. Keep the
// first field error exposed by the existing bounded-integer callers.
export function integerTypeError(issue: { input?: unknown }): string | undefined {
  return typeof issue.input === 'number' && !Number.isNaN(issue.input) && !Number.isFinite(issue.input)
    ? 'Expected integer, received float' : undefined;
}

export { z };
