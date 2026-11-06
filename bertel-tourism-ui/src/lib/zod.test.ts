/** @jest-environment node */
import { z } from './zod';
import { photoAssessmentSchema } from '../app/api/portal-photo/analyze/assessment';

it('uses the locked patched Zod runtime', () => {
  expect(require('zod/package.json').version).toBe('4.6.7');
});

it.each(['array', 'set', 'map'] as const)('rejects an oversized %s before parsing its elements', (kind) => {
  let visits = 0;
  const element = z.string().refine(() => { visits += 1; return true; });
  const schema = kind === 'array' ? z.array(element).max(2)
    : kind === 'set' ? z.set(element).max(2) : z.map(z.string(), element).max(2);
  const input = (size: number) => kind === 'array' ? ['a', 'b', 'c'].slice(0, size)
    : kind === 'set' ? new Set(['a', 'b', 'c'].slice(0, size))
      : new Map(['a', 'b', 'c'].slice(0, size).map((value) => [value, value] as const));

  const rejected = schema.safeParse(input(3));
  expect(rejected.success).toBe(false);
  if (!rejected.success) expect(rejected.error.issues).toEqual([expect.objectContaining({ code: 'too_big', maximum: 2 })]);
  expect(visits).toBe(0);

  expect(schema.safeParse(input(2)).success).toBe(true);
  expect(visits).toBeGreaterThan(0);
});

it('enforces the real photo strengths bound before reading untrusted elements', () => {
  let reads = 0;
  const counted = (size: number) => new Proxy(Array(size).fill(' Good light '), {
    get(target, property, receiver) {
      if (typeof property === 'string' && /^\d+$/.test(property)) reads += 1;
      return Reflect.get(target, property, receiver);
    },
  });
  const photo = { score: 8, summary: ' Clear subject ', strengths: counted(6), issues: [] };
  const rejected = photoAssessmentSchema.safeParse(photo);
  expect(rejected.success).toBe(false);
  expect(reads).toBe(0);
  if (!rejected.success) expect(rejected.error.issues.map(({ path, message }) => ({ path, message })))
    .toEqual([{ path: ['strengths'], message: 'Array must contain at most 5 element(s)' }]);

  const accepted = photoAssessmentSchema.safeParse({ ...photo, strengths: counted(5) });
  expect(accepted.success).toBe(true);
  expect(reads).toBeGreaterThan(0);
  if (accepted.success) expect(accepted.data).toEqual({
    score: 8, summary: 'Clear subject', strengths: Array(5).fill('Good light'), issues: [],
  });
});

it('keeps the finite-number message for an overflowing photo score', () => {
  const photo = JSON.parse('{"score":1e309,"summary":"Clear subject","strengths":[],"issues":[]}');
  expect(photo.score).toBe(Infinity);
  const rejected = photoAssessmentSchema.safeParse(photo);
  expect(rejected.success).toBe(false);
  if (!rejected.success) expect(rejected.error.issues.map(({ path, message }) => ({ path, message })))
    .toEqual([{ path: ['score'], message: 'Number must be finite' }]);
  expect(photoAssessmentSchema.safeParse({ ...photo, score: 8 }).success).toBe(true);
});

it('parses real objects without dynamic code evaluation under the production CSP', () => {
  let evaluations = 0;
  const dynamicFunction = jest.spyOn(globalThis, 'Function').mockImplementation(() => {
    evaluations += 1;
    throw new EvalError('Synthetic production CSP: dynamic code evaluation blocked');
  });
  try {
    jest.isolateModules(() => {
      const { z: isolated } = require('./zod') as typeof import('./zod');
      const schema = isolated.object({ name: isolated.string().min(1) });
      expect(schema.safeParse({ name: 'Synthetic object' })).toEqual({ success: true, data: { name: 'Synthetic object' } });
      expect(schema.safeParse({ name: '' }).success).toBe(false);
    });
    expect(evaluations).toBe(0);
  } finally {
    dynamicFunction.mockRestore();
  }
});
