import {
  computeCompletionStatus,
  computeNavHint,
  computeOverallCompletion,
  computeSectionCompletion,
  computeSectionCompletions,
} from './editor-completion';
import { allowAll, fullModulesFixture } from './sections/section-fixture.test-utils';
import type { ObjectWorkspaceModules } from '../../services/object-workspace-parser';

/** Clone the fixture's lone photo `count` times (only the first is the cover). */
function withPhotos(draft: ObjectWorkspaceModules, count: number): ObjectWorkspaceModules {
  const base = draft.media.objectItems[0];
  draft.media.objectItems = Array.from({ length: count }, (_, index) => ({
    ...base,
    id: `m${index}`,
    isMain: index === 0,
  }));
  return draft;
}

describe('editor completion — per-section scoring (nav rows)', () => {
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

  it('scores §06 incomplete when a HEB object has neither rooms nor a max capacity, complete when gated', () => {
    const draft = fullModulesFixture();
    draft.rooms.items = [];
    draft.capacityPolicies.capacityItems = [];
    expect(computeSectionCompletion('06', draft)).toBeLessThan(100);

    draft.rooms.unavailableReason = 'Module non applicable au type RES.';
    expect(computeSectionCompletion('06', draft)).toBe(100);
  });

  it('§06 counts a roomless HEB as complete when max_capacity has a value (§64)', () => {
    const draft = fullModulesFixture();
    draft.rooms.items = [];
    draft.rooms.unavailableReason = null;
    draft.capacityPolicies.capacityItems = [
      { recordId: 'r1', metricId: 'm', metricCode: 'max_capacity', metricLabel: 'Capacité max.', unit: 'pax', value: '8', effectiveFrom: '', effectiveTo: '' },
    ];
    expect(computeSectionCompletion('06', draft)).toBe(100);
  });

  it('§07 — a metric row with an EMPTY value does not count as complete (rail = pill)', () => {
    const draft = fullModulesFixture();
    draft.capacityPolicies.capacityItems[0].value = '';
    draft.capacityPolicies.groupPolicy = { minSize: '', maxSize: '', groupOnly: false, notes: '' };

    expect(computeSectionCompletion('07', draft)).toBe(0);
  });

  it('computeNavHint surfaces missing language codes for section 04', () => {
    const draft = fullModulesFixture();
    draft.descriptions.object.chapo.values = { fr: 'Accroche' };
    draft.descriptions.object.description.values = { fr: 'Desc' };

    expect(computeNavHint('04', draft, 50)).toMatch(/EN/);
  });
});

describe('editor completion — visitor-perceived completeness (80 / 15 / 5)', () => {
  it('scores the visitor bundle and returns nav-ready rows', () => {
    const draft = fullModulesFixture();
    const rows = computeSectionCompletions(draft, [{ num: '01', label: 'Identité' }]);

    expect(computeOverallCompletion(draft, 'HEB')).toBeGreaterThan(80);
    expect(rows).toEqual([{ num: '01', label: 'Identité', pct: 100, stat: 'ok' }]);
  });

  it('scores photos as richness min(n/4, 1) — more photos, higher score', () => {
    const two = withPhotos(fullModulesFixture(), 2);
    const four = withPhotos(fullModulesFixture(), 4);

    expect(computeOverallCompletion(four, 'HEB')).toBeGreaterThan(computeOverallCompletion(two, 'HEB'));
  });

  it('is green only when every essential is present (incl. 4 photos), orange otherwise', () => {
    const complete = withPhotos(fullModulesFixture(), 4);
    expect(computeCompletionStatus(complete, allowAll, 'HEB')).toBe('green');

    const thin = withPhotos(fullModulesFixture(), 2);
    expect(computeCompletionStatus(thin, allowAll, 'HEB')).toBe('orange');
  });

  it('is red when a publication blocker exists (missing name) regardless of richness', () => {
    const draft = withPhotos(fullModulesFixture(), 4);
    draft.generalInfo.name = '';

    expect(computeCompletionStatus(draft, allowAll, 'HEB')).toBe('red');
  });

  it('treats distinctions as a pure bonus — an unclassified object is never penalized below 80', () => {
    const classified = withPhotos(fullModulesFixture(), 4);
    const unclassified = withPhotos(fullModulesFixture(), 4);
    unclassified.distinctions.distinctionGroups = [];
    unclassified.distinctions.accessibilityLabels = [];
    unclassified.sustainability.categories = [];

    const classifiedScore = computeOverallCompletion(classified, 'HEB');
    const unclassifiedScore = computeOverallCompletion(unclassified, 'HEB');

    expect(unclassifiedScore).toBeLessThanOrEqual(classifiedScore); // bonus only adds
    expect(unclassifiedScore).toBeGreaterThanOrEqual(80); // essentials full ⇒ never "looks incomplete"
    expect(computeCompletionStatus(unclassified, allowAll, 'HEB')).toBe('green');
  });

  it('excludes non-applicable dimensions from the denominator (pricing is N-A for SRV)', () => {
    const withPrice = fullModulesFixture();
    const withoutPrice = fullModulesFixture();
    withoutPrice.pricing.prices = [];

    // SRV: pricing is N-A — removing it changes nothing.
    expect(computeOverallCompletion(withoutPrice, 'SRV')).toBe(computeOverallCompletion(withPrice, 'SRV'));
    // HEB: pricing is applicable — removing it lowers the score.
    expect(computeOverallCompletion(withoutPrice, 'HEB')).toBeLessThan(computeOverallCompletion(withPrice, 'HEB'));
  });

  it('measures the archetype-specific killer field in the type block (FMA needs dates)', () => {
    const noDates = withPhotos(fullModulesFixture(), 4); // fixture event is empty
    expect(computeCompletionStatus(noDates, allowAll, 'FMA')).not.toBe('green');

    const withDates = withPhotos(fullModulesFixture(), 4);
    withDates.event = { ...withDates.event, startDate: '2026-07-01' };
    expect(computeCompletionStatus(withDates, allowAll, 'FMA')).toBe('green');
  });

  it('FMA needs only 1 photo (a poster) for the photo essential — HEB still needs 4', () => {
    // FMA : une affiche (1 photo) + une date ⇒ complet (cible k=1, pas de pénalité au-delà).
    const poster = withPhotos(fullModulesFixture(), 1);
    poster.event = { ...poster.event, startDate: '2026-07-01' };
    expect(computeCompletionStatus(poster, allowAll, 'FMA')).toBe('green');

    // FMA sans aucune photo ⇒ orange (l'essentiel photos manque).
    const noPhoto = withPhotos(fullModulesFixture(), 0);
    noPhoto.event = { ...noPhoto.event, startDate: '2026-07-01' };
    expect(computeCompletionStatus(noPhoto, allowAll, 'FMA')).toBe('orange');

    // HEB avec une seule photo n'est PAS complet — la cible reste 4.
    const heb = withPhotos(fullModulesFixture(), 1);
    expect(computeCompletionStatus(heb, allowAll, 'HEB')).toBe('orange');
  });
});
