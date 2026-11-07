import { validateForPublication } from './editor-validation';
import { allowAll, fullModulesFixture } from './sections/section-fixture.test-utils';

// §48 — FMA archetype: an event needs a start date or at least one occurrence to publish.
describe('editor publication validation — FMA', () => {
  it('blocks publication when an FMA event has no date and no occurrence', () => {
    const draft = fullModulesFixture();
    draft.event.startDate = '';
    draft.event.occurrences = [];

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers).toContainEqual({
      section: '06',
      message: expect.stringContaining('événement'),
      tone: 'req',
    });
  });

  it('passes when a start date exists', () => {
    const draft = fullModulesFixture();
    draft.event.startDate = '2026-07-14';

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers.some((issue) => issue.section === '06')).toBe(false);
  });

  it('still blocks when the only occurrence row is empty (the saver drops it)', () => {
    const draft = fullModulesFixture();
    draft.event.startDate = '';
    draft.event.occurrences = [{ recordId: null, startAt: '', endAt: '', state: 'scheduled' }];

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers.some((issue) => issue.section === '06')).toBe(true);
  });

  it('does not apply the ITI trace blocker to FMA', () => {
    const draft = fullModulesFixture();
    draft.itinerary.geometrySummary = '';
    draft.event.startDate = '2026-07-14';

    const result = validateForPublication(draft, allowAll, 'FMA');

    expect(result.blockers).toHaveLength(0);
  });
});
