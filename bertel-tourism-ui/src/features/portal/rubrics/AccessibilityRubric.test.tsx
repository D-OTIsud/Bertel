import { fireEvent, render, screen } from '@testing-library/react';
import { AccessibilityRubric } from './AccessibilityRubric';
import { buildPortalRubrics } from '../portal-rubrics';
import type { PortalRubricFormProps } from './types';
import { fakeEditor, portalModules } from '../__fixtures__/portal-fixtures';

const options = [
  { id: 'a', code: 'acc_pmr_parking', label: 'Parking réservé', disabilityTypes: ['motor'] },
  { id: 'b', code: 'acc_guide_dog_welcome', label: 'Chien guide accueilli', disabilityTypes: ['motor', 'visual'] },
  { id: 'c', code: 'acc_adapted_bed_height', label: 'Lit adapté', disabilityTypes: ['motor'] },
  { id: 'd', code: 'acc_shower_seat', label: 'Siège de douche', disabilityTypes: ['motor'] },
];
function mount(archetype: 'RES' | 'HEB' | 'ASC' = 'RES', labelled = false, callbacks: Partial<Pick<PortalRubricFormProps, 'onDone' | 'onCancel' | 'onDirtyChange' | 'formCache'>> = {}, retired = false) {
  const modules = portalModules();
  modules.characteristics.amenityGroups = [{ familyCode: 'accessibility', familyLabel: 'Accessibilité',
    options: options.map((option) => ({ ...option, disabled: retired && ['acc_pmr_parking', 'acc_shower_seat'].includes(option.code) })) }];
  modules.characteristics.selectedAmenityCodes = ['wifi', 'acc_shower_seat', 'acc_unknown'];
  modules.characteristics.selectedPaymentCodes = ['visa'];
  modules.characteristics.selectedLanguages = [{ languageId: '', code: 'fr', label: 'Français', levelId: '', levelCode: '', levelLabel: '' }];
  modules.characteristics.selectedEnvironmentCodes = ['mountain'];
  if (labelled) modules.distinctions = { accessibilityLabels: [{ schemeCode: 'LBL_TOURISME_HANDICAP', status: 'granted', validUntil: '2099-12-31' }] } as never;
  const editor = fakeEditor(modules);
  const rubric = buildPortalRubrics({ archetype, draft: modules, dirty: {}, masked: [], floor: [], pendingModules: new Set(), rejectedModules: new Set() }).find((entry) => entry.id === 'accessibility')!;
  render(<AccessibilityRubric rubric={rubric} archetype={archetype} editor={editor} formKey="accessibility" onDone={jest.fn()} onCancel={jest.fn()} onDirtyChange={jest.fn()} {...callbacks} />);
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

test('ACT/ASC propose les aménagements partagés, jamais ceux des chambres, et conserve le reste du module', () => {
  const editor = mount('ASC');
  expect(screen.queryByLabelText('Lit adapté')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Siège de douche')).not.toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Parking réservé'));
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenCalledWith('characteristics', {
    ...editor.draft.characteristics,
    selectedAmenityCodes: ['wifi', 'acc_shower_seat', 'acc_unknown', 'acc_pmr_parking'],
  });
  expect(screen.queryByRole('heading', { name: 'Labellisé Tourisme & Handicap' })).not.toBeInTheDocument();
  expect(editor.replaceModule).not.toHaveBeenCalledWith('distinctions', expect.anything());
});

test('retirer tous les choix visibles ne déclare pas la fiche non accessible et préserve les codes inconnus', () => {
  const editor = mount('ASC');
  fireEvent.click(screen.getByLabelText('Parking réservé'));
  fireEvent.click(screen.getByLabelText('Parking réservé'));
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenCalledWith('characteristics', editor.draft.characteristics);
  expect(screen.queryByText(/non accessible/i)).not.toBeInTheDocument();
});

test('un même aménagement reste coché en passant d’une famille à l’autre', () => {
  mount('HEB');
  expect(screen.getByLabelText('Lit adapté')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Chien guide accueilli'));
  fireEvent.click(screen.getByRole('button', { name: /^Vue/ }));
  expect(screen.getByLabelText('Chien guide accueilli')).toBeChecked();
  expect(screen.queryByLabelText('Lit adapté')).not.toBeInTheDocument();
});

test('le label déjà attribué est annoncé ; aucun faux lien PDF en attendant son URL', () => {
  mount('HEB', true);
  expect(screen.getByRole('heading', { name: 'Labellisé Tourisme & Handicap' })).toBeInTheDocument();
  expect(screen.queryByText(/avez-vous pensé au label/i)).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /PDF/ })).not.toBeInTheDocument();
});

test('les compteurs de la conception approuvée suivent un choix partagé sans écrire avant Valider', () => {
  const onDone = jest.fn();
  const onDirtyChange = jest.fn();
  const formCache = new Map<string, unknown>();
  const editor = mount('HEB', false, { onDone, onDirtyChange, formCache });
  expect(screen.getByText('Votre fiche répond à 1 famille de besoins sur 4.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Vue/ })).toHaveTextContent('Rien d’indiqué');
  expect(screen.getByText('Être accessible, ce n’est pas seulement le fauteuil roulant.')).toBeInTheDocument();
  fireEvent.click(screen.getByLabelText('Chien guide accueilli'));
  expect(screen.getByText('Votre fiche répond à 2 familles de besoins sur 4.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Mobilité/ })).toHaveTextContent('2 indiqués');
  expect(screen.getByRole('button', { name: /^Vue/ })).toHaveTextContent('1 indiqué');
  expect(formCache.get('accessibility')).toEqual({ codes: ['acc_shower_seat', 'acc_guide_dog_welcome'] });
  expect(onDirtyChange).toHaveBeenLastCalledWith(true);
  expect(editor.replaceModule).not.toHaveBeenCalled();
  expect(onDone).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /^Vue/ }));
  expect(screen.getByLabelText('Chien guide accueilli')).toBeChecked();
  expect(screen.getByRole('button', { name: /^Vue/ })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenCalledTimes(1);
  expect(editor.replaceModule).toHaveBeenCalledWith('characteristics', {
    ...editor.draft.characteristics,
    selectedAmenityCodes: ['wifi', 'acc_unknown', 'acc_shower_seat', 'acc_guide_dog_welcome'],
  });
  expect(onDone).toHaveBeenCalledTimes(1);
});

test('l’encart du label demeure une information en lecture seule', () => {
  const editor = mount('HEB', true);
  const label = screen.getByRole('complementary', { name: 'Labellisé Tourisme & Handicap' });
  expect(label.querySelectorAll('input, button, a, select')).toHaveLength(0);
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test('Retour sans changer reste un abandon local, sans écriture de caractéristiques', () => {
  const onCancel = jest.fn();
  const onDone = jest.fn();
  const editor = mount('HEB', false, { onCancel, onDone });
  fireEvent.click(screen.getByLabelText('Parking réservé'));
  fireEvent.click(screen.getByRole('button', { name: 'Retour sans changer' }));
  expect(onCancel).toHaveBeenCalledTimes(1);
  expect(onDone).not.toHaveBeenCalled();
  expect(editor.replaceModule).not.toHaveBeenCalled();
});

test('un aménagement retiré déjà choisi reste conservable et supprimable, sans pouvoir être ajouté à nouveau', () => {
  const editor = mount('HEB', false, {}, true);
  const parking = screen.getByLabelText('Parking réservé');
  const shower = screen.getByLabelText('Siège de douche');
  expect(parking).toBeDisabled();
  expect(shower).toBeChecked();
  expect(shower).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenLastCalledWith('characteristics', {
    ...editor.draft.characteristics,
    selectedAmenityCodes: expect.arrayContaining(editor.draft.characteristics.selectedAmenityCodes),
  });
  const preserved = jest.mocked(editor.replaceModule).mock.calls.at(-1)?.[1] as typeof editor.draft.characteristics;
  expect(preserved.selectedAmenityCodes).toHaveLength(3);
  fireEvent.click(shower);
  expect(shower).not.toBeChecked();
  expect(shower).toBeDisabled();
  (shower as HTMLInputElement).click();
  expect(shower).not.toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenLastCalledWith('characteristics', expect.objectContaining({
    selectedAmenityCodes: ['wifi', 'acc_unknown'],
  }));
});
