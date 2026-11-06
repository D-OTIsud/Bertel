import { buildPortalRubrics, resolvePortalArchetype } from './portal-rubrics';
import { portalAccessibilityOptions } from './portal-accessibility';
import { describePortalChange } from './portal-change-summary';
import { portalModules } from './__fixtures__/portal-fixtures';

function fixture() {
  const modules = portalModules();
  modules.characteristics.amenityGroups = [
    { familyCode: 'general', familyLabel: 'Général', options: [{ id: 'wifi', code: 'wifi', label: 'Wi-Fi', disabilityTypes: [] }] },
    { familyCode: 'accessibility', familyLabel: 'Accessibilité', options: [
      { id: 'parking', code: 'acc_pmr_parking', label: 'Places PMR', disabilityTypes: ['motor'] },
      { id: 'bed', code: 'acc_adapted_bed_height', label: 'Lit adapté', disabilityTypes: ['motor'] },
    ] },
  ];
  return modules;
}

function rubrics(base = fixture(), next = base, over: Partial<Parameters<typeof buildPortalRubrics>[0]> = {}) {
  return buildPortalRubrics({ archetype: 'ASC', baseline: base, draft: next,
    dirty: { characteristics: true }, masked: [], floor: [],
    pendingModules: new Set(), rejectedModules: new Set(), ...over });
}

test.each(['ACT', 'ASC'])('%s a sa rubrique autonome avec le catalogue d’activité, sans équipement de chambre', type => {
  const archetype = resolvePortalArchetype(type)!;
  const modules = fixture();
  expect(rubrics(modules, modules, { archetype }).filter(entry => entry.module === 'characteristics').map(entry => entry.id))
    .toEqual(['amenities', 'accessibility']);
  expect(portalAccessibilityOptions(modules.characteristics, archetype).map(option => option.code)).toEqual(['acc_pmr_parking']);
  expect(portalAccessibilityOptions(modules.characteristics, 'HEB').map(option => option.code)).toEqual(['acc_pmr_parking', 'acc_adapted_bed_height']);
});

test('les états, résumés et le titre de la proposition distinguent Accessibilité et Équipements', () => {
  const base = fixture();
  const next = fixture();
  next.characteristics.selectedAmenityCodes = ['acc_pmr_parking'];
  const entries = rubrics(base, next);
  const accessibility = entries.find(entry => entry.id === 'accessibility')!;
  const equipment = entries.find(entry => entry.id === 'amenities')!;
  expect(accessibility.state).toBe('dirty');
  expect(accessibility.summary(next, 'ASC')).toBe('1 aménagement');
  expect(equipment.state).toBe('todo');
  expect(equipment.summary(next, 'ASC')).toBe('');
  expect(describePortalChange('characteristics', base, next, 'ASC').field).toBe('Accessibilité');
  next.characteristics.selectedAmenityCodes.push('wifi');
  expect(rubrics(base, next).filter(entry => entry.state === 'dirty').map(entry => entry.id)).toEqual(['amenities', 'accessibility']);
  expect(describePortalChange('characteristics', base, next, 'ASC').field).toBe('Équipements et moyens de paiement · Accessibilité');
});

test('zéro case reste à renseigner ; le masque, l’indisponibilité et la vérification restent communs au module', () => {
  const base = fixture();
  const current = rubrics(base);
  expect(current.find(entry => entry.id === 'accessibility')).toMatchObject({ state: 'todo', hasChanges: false });
  expect(rubrics(base, base, { masked: ['characteristics'] }).some(entry => entry.module === 'characteristics')).toBe(false);
  expect(rubrics(base, base, { floor: ['characteristics'] }).some(entry => entry.module === 'characteristics')).toBe(false);
  for (const state of ['pending', 'rejected'] as const) {
    expect(rubrics(base, base, { [`${state}Modules`]: new Set(['characteristics']) })
      .filter(entry => entry.module === 'characteristics').map(entry => entry.state)).toEqual([state, state]);
  }
  base.characteristics.unavailableReason = 'lecture indisponible';
  expect(rubrics(base).filter(entry => entry.module === 'characteristics').map(entry => entry.state)).toEqual(['unavailable', 'unavailable']);
});
