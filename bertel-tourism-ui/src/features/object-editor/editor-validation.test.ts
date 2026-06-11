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

  it('blocks publication when the canonical description is empty in every language', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.description = { baseValue: '', values: {} };

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers).toContainEqual({
      section: '04',
      message: expect.stringContaining('descriptif'),
      tone: 'req',
    });
  });

  it('does not block when the description exists in any language', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.description = { baseValue: '', values: { en: 'Some text' } };

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers.some((b) => b.section === '04')).toBe(false);
  });

  it('blocks publication when the canonical accroche is empty in every language', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo = { baseValue: '', values: {} };

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers).toContainEqual({
      section: '04',
      message: expect.stringContaining('accroche'),
      tone: 'req',
    });
  });

  it('does not block when the accroche exists in any language', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo = { baseValue: '', values: { en: 'Short teaser' } };

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers.some((b) => b.section === '04' && /accroche/i.test(b.message))).toBe(false);
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

  it('warns when no PUBLIC contact exists (internal-only is not enough)', () => {
    const draft = fullModulesFixture();
    draft.contacts.objectItems = [
      { ...draft.contacts.objectItems[0], isPublic: false },
    ];

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings).toContainEqual({
      section: '03',
      message: expect.stringContaining('public'),
      tone: 'warn',
    });
  });

  it('does not warn about contacts when a public contact exists', () => {
    const draft = fullModulesFixture();

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings.some((w) => w.section === '03')).toBe(false);
  });

  it('warns on a malformed e-mail contact before save', () => {
    const draft = fullModulesFixture();
    draft.contacts.objectItems = [
      { ...draft.contacts.objectItems[0], kindCode: 'email', value: 'pas-un-email' },
    ];

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings).toContainEqual({
      section: '03',
      message: expect.stringContaining('format'),
      tone: 'warn',
    });
  });

  it('warns on a malformed phone contact', () => {
    const draft = fullModulesFixture();
    draft.contacts.objectItems = [
      { ...draft.contacts.objectItems[0], kindCode: 'phone', value: 'abc' },
    ];

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings.some((w) => w.section === '03' && /format/.test(w.message))).toBe(true);
  });

  it('does not flag well-formed contact values', () => {
    const draft = fullModulesFixture();
    draft.contacts.objectItems = [
      { ...draft.contacts.objectItems[0], kindCode: 'phone', value: '+262 692 12 34 56' },
      { ...draft.contacts.objectItems[0], id: 'c2', kindCode: 'email', value: 'contact@otisud.re' },
      { ...draft.contacts.objectItems[0], id: 'c3', kindCode: 'website', value: 'https://www.otisud.re' },
    ];

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.warnings.some((w) => w.section === '03' && /format/.test(w.message))).toBe(false);
  });

  it('accepts a commune given by its INSEE code alone', () => {
    const draft = fullModulesFixture();
    draft.location.main.city = '';
    draft.location.main.codeInsee = '97411';

    const result = validateForPublication(draft, allowAll, 'HEB');

    expect(result.blockers.some((b) => b.section === '02')).toBe(false);
  });
});
