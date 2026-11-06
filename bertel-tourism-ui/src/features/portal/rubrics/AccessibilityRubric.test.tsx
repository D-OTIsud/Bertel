import { fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityRubric } from './AccessibilityRubric';
import { buildPortalRubrics } from '../portal-rubrics';
import { fakeEditor, portalModules } from '../__fixtures__/portal-fixtures';

const options = [
  { id: 'a', code: 'acc_pmr_parking', label: 'Parking réservé', disabilityTypes: ['motor'] },
  { id: 'b', code: 'acc_guide_dog_welcome', label: 'Chien guide accueilli', disabilityTypes: ['motor', 'visual'] },
  { id: 'c', code: 'acc_adapted_bed_height', label: 'Lit adapté', disabilityTypes: ['motor'] },
  { id: 'd', code: 'acc_shower_seat', label: 'Siège de douche', disabilityTypes: ['motor'] },
];
function mount(archetype: 'RES' | 'HEB' = 'RES', labelled = false) {
  const modules = portalModules();
  modules.characteristics.amenityGroups = [{ familyCode: 'accessibility', familyLabel: 'Accessibilité', options }];
  modules.characteristics.selectedAmenityCodes = ['wifi', 'acc_shower_seat', 'acc_unknown'];
  modules.characteristics.selectedPaymentCodes = ['visa'];
  if (labelled) modules.distinctions = { accessibilityLabels: [{ schemeCode: 'LBL_TOURISME_HANDICAP', status: 'granted', validUntil: '2099-12-31' }] } as never;
  const editor = fakeEditor(modules);
  const rubric = buildPortalRubrics({ archetype, draft: modules, dirty: {}, masked: [], floor: [], pendingModules: new Set(), rejectedModules: new Set() }).find((entry) => entry.id === 'accessibility')!;
  render(<AccessibilityRubric rubric={rubric} archetype={archetype} editor={editor} formKey="accessibility" onDone={jest.fn()} onCancel={jest.fn()} onDirtyChange={jest.fn()} />);
  return editor;
}

test('le restaurant ne propose ni lit ni douche ; les choix masqués et les autres équipements restent intacts', () => {
  const editor = mount();
  expect(screen.queryByLabelText('Lit adapté')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Siège de douche')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Parking réservé'));
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenCalledWith('characteristics', expect.objectContaining({ selectedAmenityCodes: ['wifi', 'acc_shower_seat', 'acc_unknown', 'acc_pmr_parking'], selectedPaymentCodes: ['visa'] }));
});

test('un même aménagement reste coché en passant d’une famille à l’autre', () => {
  mount('HEB');
  expect(screen.getByLabelText('Lit adapté')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Chien guide accueilli'));
  fireEvent.click(screen.getByRole('button', { name: /Vision/ }));
  expect(screen.getByLabelText('Chien guide accueilli')).toBeChecked();
  expect(screen.queryByLabelText('Lit adapté')).not.toBeInTheDocument();
});

test('le label déjà attribué est annoncé ; aucun faux lien PDF en attendant son URL', () => {
  mount('HEB', true);
  expect(screen.getByRole('heading', { name: 'Labellisé Tourisme & Handicap' })).toBeInTheDocument();
  expect(screen.queryByText(/avez-vous pensé au label/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /PDF/ })).not.toBeInTheDocument();
});
