import { validateForPublication } from './editor-validation';
import { allowAll, fullModulesFixture } from './sections/section-fixture.test-utils';

describe('editor publication validation', () => {
  it('returns a blocker when the object name is missing', () => {
    const draft = fullModulesFixture();
    draft.generalInfo.name = '';

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers).toContainEqual({
      section: '01',
      message: expect.stringContaining('nom commercial'),
      tone: 'req',
    });
  });

  it('returns a warning when descriptions are thin', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.description = { baseValue: 'Trop court', values: {} };

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings).toContainEqual({
      section: '04',
      message: expect.stringContaining('descriptif'),
      tone: 'warn',
    });
  });

  it('requires an itinerary trace for ITI objects', () => {
    const draft = fullModulesFixture();
    draft.itinerary.geometrySummary = '';

    const result = validateForPublication(draft, allowAll, 'ITI');

    expect(result.blockers).toContainEqual({
      section: '05',
      message: expect.stringContaining('itinéraire'),
      tone: 'req',
    });
  });

  it('requires a commune of location (§02)', () => {
    const draft = fullModulesFixture();
    draft.location.main.city = '';
    draft.location.main.codeInsee = '';

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers).toContainEqual({
      section: '02',
      message: expect.stringContaining('commune'),
      tone: 'req',
    });
  });

  it('accepts a commune given by its INSEE code alone', () => {
    const draft = fullModulesFixture();
    draft.location.main.city = '';
    draft.location.main.codeInsee = '97411';

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers.some((b) => b.section === '02')).toBe(false);
  });
});
