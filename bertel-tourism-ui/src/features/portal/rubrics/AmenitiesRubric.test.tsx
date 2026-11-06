import { fireEvent, render, screen } from '@testing-library/react';
import { AmenitiesRubric } from './AmenitiesRubric';
import { buildPortalRubrics } from '../portal-rubrics';
import { fakeEditor, portalModules } from '../__fixtures__/portal-fixtures';

it('conserve les équipements et paiements retirés déjà choisis, permet leur retrait et bloque les nouveaux choix', () => {
  const modules = portalModules();
  const equipment = [
    { id: 'wifi', code: 'wifi', label: 'Wifi retiré', disabled: true },
    { id: 'parking', code: 'parking', label: 'Parking retiré', disabled: true },
    { id: 'old-extra', code: 'old_extra', label: 'Équipement complémentaire retiré', disabled: true },
    { id: 'unused-extra', code: 'unused_extra', label: 'Autre équipement retiré', disabled: true },
  ].map((option) => ({ ...option, disabilityTypes: [] }));
  modules.characteristics.amenityGroups = [{ familyCode: 'general', familyLabel: 'Équipements', options: equipment }];
  modules.characteristics.paymentOptions = [
    { id: 'visa', code: 'visa', label: 'Visa retiré', disabled: true },
    { id: 'cash', code: 'especes', label: 'Espèces retirées', disabled: true },
    { id: 'paypal', code: 'paypal', label: 'PayPal retiré', disabled: true },
    { id: 'apple', code: 'apple_pay', label: 'Apple Pay retiré', disabled: true },
  ];
  modules.characteristics.selectedAmenityCodes = ['wifi', 'old_extra', 'historical_unknown'];
  modules.characteristics.selectedPaymentCodes = ['visa', 'paypal', 'legacy_payment'];
  const editor = fakeEditor(modules);
  const rubric = buildPortalRubrics({ archetype: 'HEB', draft: modules, dirty: {}, masked: [], floor: [],
    pendingModules: new Set(), rejectedModules: new Set() }).find((entry) => entry.id === 'amenities')!;
  render(<AmenitiesRubric rubric={rubric} archetype="HEB" editor={editor} formKey="amenities"
    onDone={jest.fn()} onCancel={jest.fn()} onDirtyChange={jest.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenLastCalledWith('characteristics', {
    ...modules.characteristics,
    selectedAmenityCodes: expect.arrayContaining(modules.characteristics.selectedAmenityCodes),
    selectedPaymentCodes: expect.arrayContaining(modules.characteristics.selectedPaymentCodes),
  });
  const preserved = jest.mocked(editor.replaceModule).mock.calls.at(-1)?.[1] as typeof modules.characteristics;
  expect(preserved.selectedAmenityCodes).toHaveLength(3);
  expect(preserved.selectedPaymentCodes).toHaveLength(3);
  for (const label of ['Parking retiré', 'Autre équipement retiré', 'Espèces retirées', 'Apple Pay retiré']) {
    expect(screen.getByLabelText(label)).not.toBeChecked();
    expect(screen.getByLabelText(label)).toBeDisabled();
  }
  for (const label of ['Wifi retiré', 'Équipement complémentaire retiré', 'Visa retiré', 'PayPal retiré']) {
    const choice = screen.getByLabelText(label);
    expect(choice).toBeChecked();
    expect(choice).toBeEnabled();
    fireEvent.click(choice);
    expect(choice).not.toBeChecked();
    expect(choice).toBeDisabled();
    (choice as HTMLInputElement).click();
    expect(choice).not.toBeChecked();
  }
  fireEvent.click(screen.getByRole('button', { name: 'Valider' }));
  expect(editor.replaceModule).toHaveBeenLastCalledWith('characteristics', expect.objectContaining({
    selectedAmenityCodes: ['historical_unknown'], selectedPaymentCodes: ['legacy_payment'],
  }));
});
