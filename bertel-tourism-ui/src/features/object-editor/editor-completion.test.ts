import {
  computeNavHint,
  computeOverallCompletion,
  computeSectionCompletion,
  computeSectionCompletions,
} from './editor-completion';
import { fullModulesFixture } from './sections/section-fixture.test-utils';

describe('editor completion scoring', () => {
  it('scores an empty descriptions module low', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo = { baseValue: '', values: {} };
    draft.descriptions.object.description = { baseValue: '', values: {} };

    expect(computeSectionCompletion('04', draft)).toBe(0);
  });

  it('scores a fully filled descriptions module at 100', () => {
    const draft = fullModulesFixture();

    expect(computeSectionCompletion('04', draft)).toBe(100);
  });

  it('scores §06 (type block) incomplete when a HEB object has no rooms, complete when gated', () => {
    const draft = fullModulesFixture();
    draft.rooms.items = [];
    expect(computeSectionCompletion('06', draft)).toBeLessThan(100);

    draft.rooms.unavailableReason = 'Module non applicable au type RES.';
    expect(computeSectionCompletion('06', draft)).toBe(100);
  });

  it('§07 — a metric row with an EMPTY value does not count as complete (rail = pill)', () => {
    const draft = fullModulesFixture();
    draft.capacityPolicies.capacityItems[0].value = '';
    draft.capacityPolicies.groupPolicy = { minSize: '', maxSize: '', groupOnly: false, notes: '' };

    expect(computeSectionCompletion('07', draft)).toBe(0);
  });

  it('averages known completion sections and returns nav-ready rows', () => {
    const draft = fullModulesFixture();
    const rows = computeSectionCompletions(draft, [{ num: '01', label: 'Identité' }]);

    expect(computeOverallCompletion(draft)).toBeGreaterThan(80);
    expect(rows).toEqual([{ num: '01', label: 'Identité', pct: 100, stat: 'ok' }]);
  });

  it('computeNavHint surfaces missing language codes for section 04', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo.values = { fr: 'Accroche' };
    draft.descriptions.object.description.values = { fr: 'Desc' };

    expect(computeNavHint('04', draft, 50)).toMatch(/EN/);
  });
});
