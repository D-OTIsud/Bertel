import { renderHook } from '@testing-library/react';
import { useObjectEditorState } from '../useObjectEditorState';
import { fullModulesFixture } from './section-fixture.test-utils';
import { buildPreviewCardFromDraft } from './tags-preview';

describe('buildPreviewCardFromDraft', () => {
  it('maps draft name/city, §09 tags -> colored tagChips, §08 distinctions -> neutral classification', () => {
    const { result } = renderHook(() => useObjectEditorState('o1', fullModulesFixture()));
    const card = buildPreviewCardFromDraft(result.current, 'HOT');

    expect(card.name).toBe('Domaine du Bel Air');
    expect(card.location?.city).toBe('Saint-Pierre');

    // §09 tags become COLORED chips, in priority order, carrying their hex.
    expect(card.tagChips?.map((c) => c.label)).toEqual(['Hôtel 4★', 'Cuisine']);
    expect(card.tagChips?.[0].color).toBe('#14b8a6');

    // §08 granted distinction (Étoiles · 4 étoiles) lands in the NEUTRAL labels blend (and would win
    // the single neutral slot on the card) — it is NOT a colored §09 chip.
    expect(card.labels?.some((l) => l.includes('4 étoiles'))).toBe(true);
    expect(card.tagChips?.some((c) => c.label.includes('étoile'))).toBe(false);
  });
});
