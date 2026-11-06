import { failedPhotoAssessment, parsePhotoAssessment } from './assessment';

const valid = {
  score: 7.5,
  summary: 'Le lieu est lisible, avec une zone sombre au premier plan.',
  strengths: ['Le sujet principal est net.'],
  issues: [{ code: 'exposure', explanation: 'Le premier plan est sombre.', suggestion: 'Reprendre la photo avec une lumière plus uniforme.' }],
};

it('keeps even an excellent assessment in office review', () => {
  expect(parsePhotoAssessment(JSON.stringify({ ...valid, score: 10 }))).toEqual({
    state: 'assessed', assessment: { ...valid, score: 10 }, publication: 'office_review',
  });
});

it.each([
  { ...valid, score: -1 }, { ...valid, score: 11 }, { ...valid, score: '7.5' },
  { ...valid, score: null }, { ...valid, summary: '' },
  { ...valid, approved: true },
  { ...valid, issues: [{ ...valid.issues[0], code: 'copyright_verified' }] },
  { ...valid, strengths: Array(6).fill('Point positif') },
])('rejects a malformed or decision-bearing response %#', (value) => {
  expect(() => parsePhotoAssessment(JSON.stringify(value))).toThrow();
});

it('refuses oversized output instead of accepting a truncated score', () => {
  expect(() => parsePhotoAssessment(' '.repeat(16_385))).toThrow();
});

it('does not turn a failure into a bad score or permit an uncertain automatic retry', () => {
  expect(failedPhotoAssessment(false)).toEqual({ state: 'unavailable', assessment: null, publication: 'office_review' });
  expect(failedPhotoAssessment(true)).toEqual({ state: 'uncertain', assessment: null, publication: 'office_review' });
});
