import {
  availableValueOptions,
  createClassificationDraft,
  isSchemeFullyUsed,
  regroupDistinctionItems,
} from './classification-edit';
import type {
  ObjectWorkspaceDistinctionItem,
  ObjectWorkspaceDistinctionSchemeOption,
} from '../../../services/object-workspace-parser';

function item(over: Partial<ObjectWorkspaceDistinctionItem>): ObjectWorkspaceDistinctionItem {
  return {
    recordId: null,
    schemeId: '',
    schemeCode: '',
    schemeLabel: '',
    valueId: '',
    valueCode: '',
    valueLabel: '',
    status: 'granted',
    awardedAt: '',
    validUntil: '',
    disabilityTypesCovered: [],
    ...over,
  };
}

const starsScheme: ObjectWorkspaceDistinctionSchemeOption = {
  id: 'sch-stars',
  code: 'hot_stars',
  label: 'Classement hôtelier',
  selectionMode: 'single',
  isAccessibility: false,
  displayGroup: 'official_classification',
  valueOptions: [
    { id: 'v1', code: '1', label: '1 étoile' },
    { id: 'v2', code: '2', label: '2 étoiles' },
    { id: 'v3', code: '3', label: '3 étoiles' },
  ],
};

const fermeScheme: ObjectWorkspaceDistinctionSchemeOption = {
  id: 'sch-ferme',
  code: 'bienvenue_ferme',
  label: 'Bienvenue à la Ferme',
  selectionMode: 'multiple',
  isAccessibility: false,
  displayGroup: 'quality_label',
  valueOptions: [
    { id: 'f1', code: 'ferme_sejour', label: 'Ferme séjour' },
    { id: 'f2', code: 'table_hote', label: "Table d'hôte" },
  ],
};

describe('createClassificationDraft', () => {
  it('returns a blank item defaulting to the granted status', () => {
    const draft = createClassificationDraft();
    expect(draft.recordId).toBeNull();
    expect(draft.schemeCode).toBe('');
    expect(draft.valueCode).toBe('');
    expect(draft.status).toBe('granted');
  });
});

describe('regroupDistinctionItems', () => {
  it('returns an empty array for no items', () => {
    expect(regroupDistinctionItems([])).toEqual([]);
  });

  it('groups items by scheme code, collecting multi-value schemes into one group', () => {
    const groups = regroupDistinctionItems([
      item({ schemeCode: 'hot_stars', schemeLabel: 'Classement hôtelier', valueCode: '4' }),
      item({ schemeCode: 'bienvenue_ferme', schemeLabel: 'Bienvenue à la Ferme', valueCode: 'ferme_sejour' }),
      item({ schemeCode: 'bienvenue_ferme', schemeLabel: 'Bienvenue à la Ferme', valueCode: 'table_hote' }),
    ]);
    expect(groups).toHaveLength(2);
    const ferme = groups.find((g) => g.schemeCode === 'bienvenue_ferme');
    expect(ferme?.items.map((i) => i.valueCode)).toEqual(['ferme_sejour', 'table_hote']);
  });
});

describe('isSchemeFullyUsed', () => {
  it('marks a single-selection scheme used once it has any row', () => {
    expect(isSchemeFullyUsed(starsScheme, [])).toBe(false);
    expect(isSchemeFullyUsed(starsScheme, [item({ schemeCode: 'hot_stars', valueCode: '3' })])).toBe(true);
  });

  it('marks a multi-selection scheme used only when every value is taken', () => {
    const oneTaken = [item({ schemeCode: 'bienvenue_ferme', valueCode: 'ferme_sejour' })];
    expect(isSchemeFullyUsed(fermeScheme, oneTaken)).toBe(false);
    const bothTaken = [
      item({ schemeCode: 'bienvenue_ferme', valueCode: 'ferme_sejour' }),
      item({ schemeCode: 'bienvenue_ferme', valueCode: 'table_hote' }),
    ];
    expect(isSchemeFullyUsed(fermeScheme, bothTaken)).toBe(true);
  });
});

describe('availableValueOptions', () => {
  it('excludes values already taken by other rows of the same scheme', () => {
    const items = [item({ schemeCode: 'bienvenue_ferme', valueCode: 'ferme_sejour' })];
    expect(availableValueOptions(fermeScheme, items).map((v) => v.code)).toEqual(['table_hote']);
  });

  it('keeps the value of the row currently being edited selectable', () => {
    const items = [item({ schemeCode: 'bienvenue_ferme', valueCode: 'ferme_sejour' })];
    expect(availableValueOptions(fermeScheme, items, 'ferme_sejour').map((v) => v.code)).toEqual([
      'ferme_sejour',
      'table_hote',
    ]);
  });
});
