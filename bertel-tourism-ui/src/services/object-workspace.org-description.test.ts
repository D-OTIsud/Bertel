import { orgOverlayHasContent, buildOrgDescriptionPayload } from './object-workspace';

const field = (baseValue: string, values: Record<string, string> = {}) => ({ baseValue, values });
const scope = (over: Partial<{ chapo: any; description: any; adaptedDescription: any }> = {}) => ({
  recordId: null, scope: 'object' as const, placeId: null, label: '', visibility: 'public',
  chapo: field(''), description: field(''), adaptedDescription: field(''),
  mobileDescription: field(''), editorialDescription: field(''), ...over,
});

describe('org description payload', () => {
  it('detects empty vs non-empty overlays', () => {
    expect(orgOverlayHasContent(scope())).toBe(false);
    expect(orgOverlayHasContent(scope({ chapo: field('Hi') }))).toBe(true);
    expect(orgOverlayHasContent(scope({ description: field('', { en: 'X' }) }))).toBe(true);
  });
  it('builds a payload of the three overlay fields only', () => {
    const p = buildOrgDescriptionPayload(scope({ chapo: field('C', { fr: 'C' }), description: field('D') }));
    expect(p).toMatchObject({ description_chapo: 'C', description_chapo_i18n: { fr: 'C' }, description: 'D' });
    expect('description_edition' in p).toBe(false);
    expect('description_mobile' in p).toBe(false);
  });
});
