import { computeOverallCompletion, computeSectionCompletion, computeSectionCompletions } from './editor-completion';
import { fullModulesFixture } from './sections/section-fixture.test-utils';

describe('editor completion scoring', () => {
  it('scores an empty descriptions module low', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo = { baseValue: '', values: {} };
    draft.descriptions.object.description = { baseValue: '', values: {} };

    expect(computeSectionCompletion('02', draft)).toBe(0);
  });

  it('scores a fully filled descriptions module at 100', () => {
    const draft = fullModulesFixture();

    expect(computeSectionCompletion('02', draft)).toBe(100);
  });

  it('averages known completion sections and returns nav-ready rows', () => {
    const draft = fullModulesFixture();
    const rows = computeSectionCompletions(draft, [{ num: '01', label: 'Identité' }]);

    expect(computeOverallCompletion(draft)).toBeGreaterThan(80);
    expect(rows).toEqual([{ num: '01', label: 'Identité', pct: 100, stat: 'ok' }]);
  });
});
